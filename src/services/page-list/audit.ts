// Diagnóstico da lista de páginas: cruza as páginas do PDF com os marcadores do livro e diz o que falta e porquê. Só lê, não altera nada.
import type { PdfPageText } from './pdf-pages';
import { bodyLinesOf, detectFolios, ANCHOR_LEN, MIN_ANCHOR } from './pdf-text';
import { readBodyText, type PageLines } from './alignment';

/** Porque é que uma página do PDF ficou sem marcador na lista de páginas. */
export type MissingReason = 'branca' | 'indice' | 'figura' | 'abre-com-figura' | 'fora-de-ordem';
export interface PageListAudit {
    /** Páginas do PDF com folio (impresso ou interpolado): as que a lista de páginas devia cobrir. */
    pagesWithFolio: number;
    /** Dessas, as que têm marcador no livro. */
    marked: number;
    /** Páginas do PDF sem folio (front-matter): não entram na lista. */
    withoutFolio: number;
    missing: { page: number; reason: MissingReason }[];
    /** Marcadores no livro cujo folio não existe no PDF. */
    orphanMarkers: number[];
}

/**
 * "O que falta na lista de páginas?": cruza as páginas do PDF com os marcadores do livro e diz, para cada página sem marcador,
 * porquê — `branca` (só folio e marcas do InDesign), `indice` (página do Índice sem marcador), `figura` (há texto, mas nenhuma linha dele está no corpo: o texto vive na
 * imagem), `abre-com-figura` (a 1.ª linha, a âncora, é texto de figura que o corpo não tem, mas o resto da página ESTÁ no livro) ou
 * `fora-de-ordem` (a âncora está no livro e o alinhamento descartou-a por ficar fora da ordem do PDF).
 * Só lê; não altera nada.
 */
export function auditPageList(pages: PdfPageText[], html: string): PageListAudit {
    const { folios, printed } = detectFolios(pages);
    const text = readBodyText(html);
    const markers = text.markedPages();
    const audit: PageListAudit = { pagesWithFolio: 0, marked: 0, withoutFolio: 0, missing: [], orphanMarkers: [] };
    const inPdf = new Set<number>();
    pages.forEach((page, idx) => {
        const folio = folios[idx];
        if (folio === null) { audit.withoutFolio++; return; }
        audit.pagesWithFolio++;
        inPdf.add(folio);
        if (markers.has(folio)) { audit.marked++; return; }
        const body = bodyLinesOf(page, printed[idx] !== null);
        if (body.length === 0) { audit.missing.push({ page: folio, reason: 'branca' }); return; }
        const usable = body.filter(t => t.length >= MIN_ANCHOR);
        const inBody = (t: string) => text.inBody(t.slice(0, ANCHOR_LEN));
        const reason: MissingReason = text.isIndicePage(usable.map(t => t.slice(0, ANCHOR_LEN))) ? 'indice' : !usable.some(inBody) ? 'figura' : !inBody(usable[0]) ? 'abre-com-figura' : 'fora-de-ordem';
        audit.missing.push({ page: folio, reason });
    });
    audit.orphanMarkers = [...markers].filter(n => !inPdf.has(n)).sort((a, b) => a - b);
    return audit;
}


const MAX_PAGE_LINES = 6;

/** As páginas do PDF sem marcador no `html`, cada uma com as suas linhas que existem no corpo (as que o alinhamento pode usar). */
export function pageLinesFromPages(pages: PdfPageText[], html: string): PageLines[] {
    const { folios, printed } = detectFolios(pages);
    const text = readBodyText(html);
    const have = text.markedPages();
    const out: PageLines[] = [];
    pages.forEach((page, idx) => {
        const folio = folios[idx];
        if (folio === null || have.has(folio)) return;
        const lines = bodyLinesOf(page, printed[idx] !== null).filter(t => t.length >= MIN_ANCHOR).map(t => t.slice(0, ANCHOR_LEN)).filter(t => text.inBody(t) || text.inIndice(t));
        if (lines.length) out.push({ page: folio, lines: lines.slice(0, MAX_PAGE_LINES) });
    });
    return out;
}
