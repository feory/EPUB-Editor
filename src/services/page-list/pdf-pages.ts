// A ÚNICA porta de entrada do pdfjs: lê o PDF e devolve o texto de cada página (`PdfPageText`). Tudo o que interpreta esse texto
// (folios, âncoras, linhas) é puro e vive em pdf-text.ts; só este módulo importa o pdfjs (e o seu worker).

import * as pdfjsLib from 'pdfjs-dist';

// Worker partilhado com o pdf-service (já configurado lá); reconfigurar é idempotente.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();


// Texto de cada página do PDF (itens do pdfjs + altura) — a ÚNICA leitura do ficheiro; tudo o resto trabalha sobre isto.
export interface PdfPageText { vpH: number; items: { str: string; transform: number[] }[] }
export async function readPdfPages(data: ArrayBuffer): Promise<PdfPageText[]> {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: PdfPageText[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vpH = page.getViewport({ scale: 1 }).height;
        const items = (await page.getTextContent()).items as PdfPageText['items'];
        pages.push({ vpH, items });
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
