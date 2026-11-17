// O PDF de impressão do livro como UM módulo: quem precisa de páginas, linhas ou estilos pede-os aqui e o parse (O(páginas), pdfjs)
// corre no máximo uma vez por PDF. O pdfjs neutraliza o ArrayBuffer que lhe é passado — a cópia é feita aqui, o `data` do chamador
// sobrevive (printPdf guardado, outras leituras). Dois adapters do mesmo seam: `createPrintPdf` (PDF real) e `printPdfFromPages`
// (páginas já lidas — testes e quem já as tem).
import type { PdfPageText } from './pdf-pages';
import { pdfStyles, type PdfStyles } from './pdf-styles';

export interface PrintPdf {
    pages(): Promise<PdfPageText[]>;
    styles(): Promise<PdfStyles>;
}

export function printPdfFromPages(read: () => Promise<PdfPageText[]>): PrintPdf {
    let pages: Promise<PdfPageText[]> | undefined;
    let styles: Promise<PdfStyles> | undefined;
    return {
        pages: () => (pages ??= read()),
        styles: () => (styles ??= (pages ??= read()).then(pdfStyles)),
    };
}

/** O pdfjs só carrega quando há PDF a ler (import dinâmico). */
export const createPrintPdf = (data: ArrayBuffer): PrintPdf =>
    printPdfFromPages(async () => (await import('./pdf-pages')).readPdfPages(data.slice(0)));
