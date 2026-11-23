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

/** O PDF de um livro: os bytes (para o viewer) e a leitura memoizada (para quem precisa do texto). */
export interface PrintPdfEntry { data: ArrayBuffer; pdf: PrintPdf }

/**
 * O PDF de impressão do livro aberto, descarregado e lido UMA vez e partilhado por quem o pede (assistente, painel do PDF, importação).
 * Só guarda o último livro (um PDF pode ter 150 MB). Quem grava um PDF novo passa por `save`, que troca o que está em memória: é a única
 * invalidação. Sem PDF (`null`) ou com erro não se guarda nada, por isso um PDF carregado a seguir (de outro modo) lê-se à primeira.
 */
export interface PrintPdfStore {
    get(isbn: string): Promise<PrintPdfEntry | null>;
    save(isbn: string, data: ArrayBuffer | Blob): Promise<void>;
}

/** `download` devolve `null` quando o livro não tem PDF e lança se falha; `open` é o adapter que lê os bytes (os testes passam o seu). */
export function createPrintPdfStore(io: {
    download(isbn: string): Promise<ArrayBuffer | null>;
    upload(isbn: string, data: ArrayBuffer | Blob): Promise<unknown>;
    open?: (data: ArrayBuffer) => PrintPdf;
}): PrintPdfStore {
    const open = io.open ?? createPrintPdf;
    const entry = (data: ArrayBuffer): PrintPdfEntry => ({ data, pdf: open(data) });
    let slot: { isbn: string; entry: Promise<PrintPdfEntry | null> } | null = null;
    const forget = (mine: typeof slot) => { if (slot === mine) slot = null; };
    return {
        get(isbn) {
            if (slot?.isbn === isbn) return slot.entry;
            const mine: typeof slot = { isbn, entry: io.download(isbn).then((data) => (data ? entry(data) : null)) };
            slot = mine;
            mine.entry.then((e) => { if (!e) forget(mine); }, () => forget(mine));
            return mine.entry;
        },
        async save(isbn, data) {
            await io.upload(isbn, data); // se falha, o que estava em memória continua válido
            slot = null;
            const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
            slot = { isbn, entry: Promise.resolve(entry(bytes)) };
        },
    };
}
