// Forma HTML dos marcadores de ligação do Índice — único dono (à imagem de page-list/marker.ts):
// quem gera, procura ou lê um marcador importa daqui em vez de repetir classes, ids e regex.
// Sem imports (o export do EPUB, propositadamente puro, também usa isto).
//
//   origem:  <span class="idx-link" data-target="ID">texto da entrada</span>   (nunca <a>: o cleaner apaga <a>)
//   destino: <p class="chapter-anchor" id="ID"></p>                            (capítulo / subtítulo)
//            <span class="manual-anchor" id="ID" data-label="nome"></span>    (ponto livre, inserido no cursor)
// Só no export viram <a href> (ver services/export/epub/index-links.ts).

export const IDX_LINK_CLASS = 'idx-link';
export const CHAPTER_ANCHOR_CLASS = 'chapter-anchor';
export const MANUAL_ANCHOR_CLASS = 'manual-anchor';

// --- ids de destino ---
export const chapterTargetId = (chapter: number) => `idx-anchor-${chapter}`;
export const subTargetId = (chapter: number, seq: number) => `idx-anchor-${chapter}-${seq}`;           // lote (pseudo-heading)
export const pickedSubTargetId = (chapter: number, n: number) => `idx-anchor-${chapter}-m${n}`;       // escolhido à mão
export const epubTargetId = (n: number) => `idx-anchor-ep${n}`;                                        // links internos do EPUB importado
export const newManualAnchorId = () => `idx-anchor-m${Date.now().toString(36)}`;                       // único sem varrer o livro
export const pickedSubIdPattern = (chapter: number) => new RegExp(`id="${chapterTargetId(chapter)}-m(\\d+)"`, 'g');

/** Capítulo a que um destino pertence; -1 se o id não o diz (âncora manual, page-N). */
export const chapterOfTarget = (target: string): number => Number(target.match(/^idx-anchor-(\d+)/)?.[1] ?? -1);

// --- construtores ---
export const idxLinkHtml = (target: string, inner: string) => `<span class="${IDX_LINK_CLASS}" data-target="${target}">${inner}</span>`;
export const chapterAnchorHtml = (id: string) => `<p class="${CHAPTER_ANCHOR_CLASS}" id="${id}"></p>`;
export const manualAnchorHtml = (id: string, label: string) =>
    `<span class="${MANUAL_ANCHOR_CLASS}" id="${id}" data-label="${label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}"></span>`;

// --- leitura / limpeza ---
/** Tira o idx-link final de um <p> (fica o texto). Sem ligação, devolve `inner` igual. */
export const unwrapTrailingIdxLink = (inner: string) =>
    inner.replace(/<span\b[^>]*\bclass="[^"]*\bidx-link\b[^"]*"[^>]*>([\s\S]*?)<\/span>\s*$/, '$1');
/** Tira todos os idx-link (e os chapter-anchor) de uma part: reexecução do lote é idempotente. */
export const stripAutoMarkers = (part: string) => part
    .replace(/<span\b[^>]*\bclass="[^"]*\bidx-link\b[^"]*"[^>]*>([\s\S]*?)<\/span>(?=\s*<\/p>)/g, '$1')
    .replace(/<p\b[^>]*\bclass="[^"]*\bchapter-anchor\b[^"]*"[^>]*>[\s\S]*?<\/p>/g, '');
/** Id do chapter-anchor que já está logo a seguir a `pos`, se houver. */
export const chapterAnchorIdAfter = (content: string, pos: number): string | undefined =>
    content.slice(pos).match(/^\s*<p\b(?=[^>]*\bclass="chapter-anchor")[^>]*\bid="([^"]+)"[^>]*><\/p>/)?.[1];
/** Âncoras manuais de uma part (regex global nova a cada chamada: tem estado). Grupo 1 = atributos. */
export const manualAnchorRe = () => /<span\b([^>]*\bmanual-anchor\b[^>]*)><\/span>/gi;
/** idx-link com conteúdo possivelmente aninhado (marcador de página dentro): [\s\S]*? sozinho pararia no 1º </span>. */
export const IDX_LINK_SPAN_RE = /<span\b[^>]*\bclass="[^"]*\bidx-link\b[^"]*"[^>]*>((?:<span\b[^>]*>[\s\S]*?<\/span>|(?!<\/span>)[\s\S])*)<\/span>/g;
