import * as pdfjsLib from 'pdfjs-dist';

// Worker partilhado com o pdf-service (já configurado lá); reconfigurar é idempotente.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

export interface PageAnchor { page: number; anchor: string }

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

// Normaliza para casar PDF↔editor apesar de espaçamento/hifenização/pontuação diferentes:
// minúsculas, só letras (incl. acentuadas) e dígitos.
function normalize(s: string): string {
    return s.toLowerCase().replace(/[^0-9a-zà-öø-ÿ]/g, '');
}

const ANCHOR_LEN = 30;   // chars normalizados usados como âncora
const MIN_ANCHOR = 15;   // mínimo para a âncora ser fiável

// Item só-dígitos mais próximo da margem (rodapé: menor y; cabeçalho: maior y — coords do PDF
// são bottom-up). Devolve o folio dessa página nessa zona, ou null se não houver nenhum.
function folioInZone(items: { str: string; transform: number[] }[], vpH: number, zone: 'bottom' | 'top'): number | null {
    let folio: number | null = null;
    let best = zone === 'bottom' ? Infinity : -Infinity;
    for (const it of items) {
        if (!('str' in it) || !it.str) continue;
        const y = it.transform[5];
        const t = it.str.trim();
        if (!/^\d{1,4}$/.test(t)) continue;
        const inZone = zone === 'bottom' ? y < vpH * 0.12 : y > vpH * 0.88;
        if (!inZone) continue;
        const closerToEdge = zone === 'bottom' ? y < best : y > best;
        if (closerToEdge) { folio = parseInt(t); best = y; }
    }
    return folio;
}

// Nº de pares consecutivos (entre páginas COM folio detetado nesta zona) em que o valor CRESCE —
// separa folios reais (seguem a ordem do livro) de falsos positivos dispersos (nºs de nota,
// células de tabela, entradas de índice com dot-leaders) que não têm relação com a ordem real.
function monotonicScore(folios: (number | null)[]): number {
    const vals = folios.filter((f): f is number => f !== null);
    let inc = 0;
    for (let k = 1; k < vals.length; k++) if (vals[k] > vals[k - 1]) inc++;
    return inc;
}

/**
 * Extrai, por página do PDF de impressão, o número impresso (folio) e um texto-âncora
 * (início do corpo). Cada página = cabeçalho corrente (linha de topo, saltada) + folio
 * colado ao 1º texto do corpo (ex. "41na própria…"). Páginas sem folio numérico
 * (front-matter romano, aberturas de capítulo) são saltadas.
 *
 * O folio pode estar no RODAPÉ (comum) ou fundido na linha de CABEÇALHO no topo da página
 * (alguns livros) — a zona é auto-detetada por livro (não por página) comparando quantos
 * folios de cada zona seguem a ordem real das páginas (`monotonicScore`), para não confundir
 * folio com nºs de nota/tabela/índice que também caem por vezes numa das zonas.
 */
export async function extractPdfPageAnchors(data: ArrayBuffer): Promise<PageAnchor[]> {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: { vpH: number; items: { str: string; transform: number[] }[] }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vpH = page.getViewport({ scale: 1 }).height;
        const items = (await page.getTextContent()).items as { str: string; transform: number[] }[];
        pages.push({ vpH, items });
    }
    const bottomFolios = pages.map(({ items, vpH }) => folioInZone(items, vpH, 'bottom'));
    const topFolios = pages.map(({ items, vpH }) => folioInZone(items, vpH, 'top'));
    const folios = monotonicScore(topFolios) > monotonicScore(bottomFolios) ? topFolios : bottomFolios;

    const anchors: PageAnchor[] = [];
    for (let idx = 0; idx < pages.length; idx++) {
        const folio = folios[idx];
        if (folio === null) continue; // sem folio (front-matter, abertura de capítulo) → saltar
        const lines = new Map<number, { x: number; str: string }[]>();
        for (const it of pages[idx].items) {
            if (!('str' in it) || !it.str) continue;
            const y = it.transform[5];
            (lines.get(Math.round(y)) ?? lines.set(Math.round(y), []).get(Math.round(y))!).push({ x: it.transform[4], str: it.str });
        }
        // âncora = 1ª linha de corpo APÓS o cabeçalho corrente (linha de topo); ordenar topo→baixo
        const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0])
            .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map(p => p.str).join(''));
        for (const line of ordered.slice(1)) {
            const anchor = normalize(line).slice(0, ANCHOR_LEN);
            if (anchor.length < MIN_ANCHOR) continue;
            anchors.push({ page: folio, anchor });
            break;
        }
    }
    return anchors;
}

// Índices da maior subsequência estritamente crescente de `arr` (LIS, O(n log n)).
function longestIncreasing(arr: number[]): number[] {
    const tails: number[] = [];   // tails[k] = índice do menor fim de uma subseq. de comprimento k+1
    const prev: number[] = new Array(arr.length).fill(-1);
    for (let i = 0; i < arr.length; i++) {
        let lo = 0, hi = tails.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[tails[mid]] < arr[i]) lo = mid + 1; else hi = mid; }
        if (lo > 0) prev[i] = tails[lo - 1];
        if (lo === tails.length) tails.push(i); else tails[lo] = i;
    }
    const seq: number[] = [];
    for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) seq.push(i);
    return seq.reverse();
}

/**
 * Insere marcadores de quebra de página no HTML, alinhando cada âncora do PDF ao texto do
 * editor. Cada âncora é localizada de forma INDEPENDENTE (1ª ocorrência); depois mantém-se só
 * a maior subsequência de posições CRESCENTES (LIS) — descarta outliers (ex. páginas de
 * front-matter cujo texto aparece noutro sítio) que de outra forma envenenariam um cursor
 * monotónico simples. Marcador = <span class="pagebreak" data-page="N"></span> (convertido para
 * epub:type="pagebreak" no export). Páginas sem match (ou fora da sequência) são saltadas.
 */
export function insertPageBreaks(html: string, anchors: PageAnchor[]): { html: string; inserted: number; total: number } {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // achatar text nodes do corpo: string normalizada concatenada + mapa posição→{node, offset}
    const nodes: Text[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

    let flat = '';
    const map: { node: Text; offset: number }[] = []; // map[posNormalizada] = origem do char
    for (const node of nodes) {
        const raw = node.textContent ?? '';
        for (let k = 0; k < raw.length; k++) {
            const nc = normalize(raw[k]);
            if (!nc) continue; // char descartado pela normalização (espaço/pontuação)
            flat += nc;
            map.push({ node, offset: k });
        }
    }

    // posição independente de cada âncora (1ª ocorrência); depois LIS para manter só as crescentes
    const hits: { pos: number; page: number }[] = [];
    for (const { page, anchor } of anchors) {
        const pos = flat.indexOf(anchor);
        if (pos >= 0) hits.push({ pos, page });
    }
    const keep = longestIncreasing(hits.map(h => h.pos)).map(i => hits[i]);
    const inserted = keep.length;
    const points: { node: Text; offset: number; page: number }[] = keep.map(h => ({ ...map[h.pos], page: h.page }));
    // aplicar inserções: por nó, offsets do maior para o menor (não desloca os anteriores)
    const byNode = new Map<Text, { offset: number; page: number }[]>();
    for (const p of points) (byNode.get(p.node) ?? byNode.set(p.node, []).get(p.node)!).push(p);
    for (const [node, list] of byNode) {
        list.sort((a, b) => b.offset - a.offset);
        for (const { offset, page } of list) {
            const after = node.splitText(offset);
            const span = doc.createElement('span');
            span.className = 'pagebreak';
            span.setAttribute('data-page', String(page));
            after.parentNode!.insertBefore(span, after);
        }
    }
    return { html: doc.body.innerHTML, inserted, total: anchors.length };
}

/**
 * Converte os marcadores do editor (`<span class="pagebreak" data-page="N">`) na forma
 * semântica do EPUB e recolhe (secção, página) para a page-list. Usado no export por secção.
 */
export function convertPageBreaks(html: string, sectionNum: number, sink: { section: number; page: number }[]): string {
    // tolerante à ordem/extra de atributos (TinyMCE/DOMPurify podem reordenar)
    return html.replace(/<span\b[^>]*\bclass="[^"]*\bpagebreak\b[^"]*"[^>]*><\/span>/g, (m) => {
        const n = m.match(/\bdata-page="(\d+)"/)?.[1];
        if (!n) return m;
        sink.push({ section: sectionNum, page: parseInt(n) });
        return `<span epub:type="pagebreak" role="doc-pagebreak" id="page-${n}" aria-label="${n}"></span>`;
    });
}
