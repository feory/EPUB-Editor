// A ÚNICA porta de entrada do pdfjs: lê o PDF e devolve o texto de cada página (`PdfPageText`). Tudo o que interpreta esse texto
// (folios, âncoras, linhas) é puro e vive em pdf-text.ts; só este módulo importa o pdfjs (e o seu worker).

import * as pdfjsLib from 'pdfjs-dist';

// Worker partilhado com o pdf-service (já configurado lá); reconfigurar é idempotente.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();


// Texto de cada página do PDF (itens do pdfjs + altura) — a ÚNICA leitura do ficheiro; tudo o resto trabalha sobre isto.
// `width` e `font` (negrito/itálico, lidos do nome da fonte) só interessam ao estilo (pdf-styles.ts); a lista de páginas ignora-os.
// `images` = as imagens pintadas na página (caixa em pt, y de baixo para cima como o texto): só interessam à posição das figuras (figure-audit.ts).
export interface PdfImageBox { x0: number; y0: number; x1: number; y1: number }
export interface PdfPageText { vpH: number; items: { str: string; transform: number[]; width?: number; font?: { bold: boolean; italic: boolean } }[]; images?: PdfImageBox[] }

const MIN_IMAGE = 40;       // pt: abaixo disto é filete, ícone ou ornamento, não figura
const MAX_PAGE_SHARE = 0.9; // fração da página: acima disto é fundo/capa

/** As caixas das imagens de uma lista de operadores do pdfjs (segue save/restore/transform para ter a matriz de cada pintura). `ops` = o `OPS` do pdfjs. */
export function imageBoxes(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: Record<string, number>, vpW: number, vpH: number): PdfImageBox[] {
    const mul = (m: number[], n: number[]) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    const painters = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject, ops.paintImageXObjectRepeat]);
    const stack: number[][] = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const out: PdfImageBox[] = [];
    for (let k = 0; k < fnArray.length; k++) {
        const f = fnArray[k];
        if (f === ops.save) stack.push(ctm);
        else if (f === ops.restore) ctm = stack.pop() ?? ctm;
        else if (f === ops.transform) ctm = mul(ctm, argsArray[k] as number[]);
        else if (painters.has(f)) {
            const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]], ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
            const box = { x0: Math.round(Math.min(...xs)), x1: Math.round(Math.max(...xs)), y0: Math.round(Math.min(...ys)), y1: Math.round(Math.max(...ys)) };
            const w = box.x1 - box.x0, h = box.y1 - box.y0;
            if (w >= MIN_IMAGE && h >= MIN_IMAGE && (w * h) / (vpW * vpH) < MAX_PAGE_SHARE) out.push(box);
        }
    }
    return out;
}

/** Negrito/itálico a partir do nome da fonte do PDF ("Foo-BoldItalic", "Foo Semibold Oblique"…). */
export function fontStyleOf(name: string): { bold: boolean; italic: boolean } {
    return { bold: /bold|black|heavy|semibold|demi/i.test(name), italic: /italic|oblique/i.test(name) };
}

export async function readPdfPages(data: ArrayBuffer): Promise<PdfPageText[]> {
    // fontExtraProperties: sem isto o pdfjs (6.5) não dá o nome real da fonte ("…NewBaskerville-Bold") em commonObjs, só um id interno, e
    // nenhuma fonte parecia negrito/itálico: o check_styles mandava tirar o p-bold de todos os subtítulos (37 num livro de 444 páginas).
    const pdf = await pdfjsLib.getDocument({ data, fontExtraProperties: true }).promise;
    const pages: PdfPageText[] = [];
    const byFont = new Map<string, { bold: boolean; italic: boolean }>(); // id interno do pdfjs → estilo (cache por documento)
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const view = page.getViewport({ scale: 1 });
        const vpH = view.height;
        const content = await page.getTextContent();
        const texts = content.items as { str: string; transform: number[]; width: number; fontName: string }[];
        // A lista de operadores dá as imagens da página e carrega as fontes: o nome real ("…SourceSansPro-Bold") só existe em commonObjs
        // depois disso (o getTextContent não o faz).
        const ops = await page.getOperatorList();
        const images = imageBoxes(ops.fnArray, ops.argsArray, pdfjsLib.OPS as unknown as Record<string, number>, view.width, view.height);
        const items = texts.map((t) => {
            if (!t.str) return { str: t.str, transform: t.transform };
            let font = byFont.get(t.fontName);
            if (!font) {
                let real: string | undefined;
                try { real = page.commonObjs.has(t.fontName) ? page.commonObjs.get(t.fontName)?.name : undefined; } catch { /* não resolvida */ }
                font = fontStyleOf(real ?? '');
                byFont.set(t.fontName, font);
            }
            return { str: t.str, transform: t.transform, width: t.width, font };
        });
        pages.push({ vpH, items, images });
    }
    return pages;
}

// Nº de páginas de um PDF — usado para distinguir o PDF de impressão (miolo, ~centenas de
// páginas) de uma figura em PDF vetorial (1-2 páginas) quando ambos vivem em Links/, sem
// depender do nome do ficheiro.
export async function getPdfPageCount(data: ArrayBuffer): Promise<number> {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    return pdf.numPages;
}

/**
 * Renderiza a 1ª página de um PDF para JPEG (Links/ do InDesign por vezes traz as figuras
 * em PDF vetorial). `scale` controla a resolução; fundo branco (PDFs podem ser transparentes).
 */
export async function pdfToJpeg(data: ArrayBuffer, scale = 2): Promise<Blob> {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob falhou')), 'image/jpeg', 0.92));
}
