// Forma HTML do marcador de page-list do editor — único dono: alignment.ts (stripPageBreaks), convertPageBreaks (abaixo, no export)
// e src/services/export/epub/index-links.ts (idx-link do Índice
// Remissivo precisa de saber que id um data-page vai ganhar ANTES de convertPageBreaks lho
// atribuir, ver buildIdToSectionMap) nunca terem cópias divergentes. Módulo à parte (sem
// import nenhum) para não arrastar o alinhamento nem o pdfjs-dist para quem só precisa do
// regex — index-links.ts é propositadamente puro/sem DOM, testável com bun test.
export const PAGEBREAK_MARKER_RE = /<span\b[^>]*\bclass="[^"]*\bpagebreak\b[^"]*"[^>]*><\/span>/g;
export const DATA_PAGE_RE = /\bdata-page="(\d+)"/;

/**
 * Converte os marcadores do editor (`<span class="pagebreak" data-page="N">`) na forma
 * semântica do EPUB e recolhe (secção, página) para a page-list. Usado no export por secção.
 */
export function convertPageBreaks(html: string, sectionNum: number, sink: { section: number; page: number }[]): string {
    return html.replace(PAGEBREAK_MARKER_RE, (m) => {
        const n = m.match(DATA_PAGE_RE)?.[1];
        if (!n) return m;
        sink.push({ section: sectionNum, page: parseInt(n) });
        return `<span epub:type="pagebreak" role="doc-pagebreak" id="page-${n}" aria-label="${n}"></span>`;
    });
}
