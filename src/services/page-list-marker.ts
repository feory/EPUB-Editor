// Forma HTML do marcador de page-list do editor — único dono, para page-list.ts
// (stripPageBreaks/convertPageBreaks) e src/services/epub/index-links.ts (idx-link do Índice
// Remissivo precisa de saber que id um data-page vai ganhar ANTES de convertPageBreaks lho
// atribuir, ver buildIdToSectionMap) nunca terem cópias divergentes. Módulo à parte (sem
// import nenhum) para não arrastar o pdfjs-dist de page-list.ts para quem só precisa do
// regex — index-links.ts é propositadamente puro/sem DOM, testável com bun test.
export const PAGEBREAK_MARKER_RE = /<span\b[^>]*\bclass="[^"]*\bpagebreak\b[^"]*"[^>]*><\/span>/g;
export const DATA_PAGE_RE = /\bdata-page="(\d+)"/;
