/**
 * Marcador de capítulo + "enchimento" + heading: o único módulo que sabe o que pode ficar ENTRE o marcador
 * (<p class="chapter-break-hN">) e o seu heading, e o que é um bloco "sem conteúdo" para quem procura o bloco anterior.
 * Quem produz (page-list: a div do marcador de página) e quem consome (toc, editor, regras da IA) partilham esta definição.
 * Duas formas da MESMA definição — texto (LEADING_FILLER_RE) e DOM (isFillerBlock); chapter-filler.test.ts garante que concordam.
 * Sem imports (a estrutura geral dos capítulos está em chapters.ts).
 */

/** Classe de marcador de capítulo: plano (`chapter-break`) ou de nível (`chapter-break-h1`…). */
export const isBreakClass = (className: string): boolean => /(^|\s)chapter-break/.test(className);

/** Seletores CSS do mesmo conceito (editor, geometria, page-list). */
export const BREAK_ATTR = '[class*="chapter-break"]';
export const BREAK_SELECTOR = `p${BREAK_ATTR}`;
export const LEVEL_BREAK_SELECTOR = 'p[class*="chapter-break-h1"], p[class*="chapter-break-h2"]';

/** Marcador de capítulo ou âncora de capítulo: estrutura do livro, nunca conteúdo. */
export const isStructureBlock = (el: Element): boolean => /\bchapter-(break|anchor)/.test(el.className);

/** Bloco sem conteúdo: estrutura, `hr` ou vazio (a div do marcador de página, o <p> só com ele, um <p></p>). Salta-se ao procurar o bloco anterior. */
export const isFillerBlock = (el: Element): boolean =>
    isStructureBlock(el) || el.tagName === 'HR' || (!(el.textContent || '').trim() && !el.querySelector('img,table,svg'));

/** O marcador de capítulo deste bloco (o primeiro irmão anterior que não é enchimento), ou null. `anchor` pode ter enchimento pelo meio. */
export function markerBefore(anchor: Element): Element | null {
    let prev = anchor.previousElementSibling;
    while (prev && isFillerBlock(prev) && !isBreakClass(prev.className)) prev = prev.previousElementSibling;
    return prev && isBreakClass(prev.className) ? prev : null;
}

/** Quem produz o enchimento: a div que leva o marcador de página `pagebreak` para o início do capítulo (div e não <p>: não conta nos <p> das Ligações do Índice). */
export function createPageHolder(doc: Document, pagebreak: Element): HTMLDivElement {
    const holder = doc.createElement('div');
    holder.appendChild(pagebreak);
    holder.appendChild(doc.createTextNode('\u00a0'));
    return holder;
}

/** O enchimento em texto, logo a seguir ao marcador: a div do marcador de página, o <p> só com ele, âncora, `hr` e parágrafos vazios. */
export const LEADING_FILLER_RE = /^(?:\s*(?:<div>\s*<span class="pagebreak"[^>]*><\/span>(?:&nbsp;|\u00a0|\s)*<\/div>|<p\b[^>]*>\s*(?:<span class="pagebreak"[^>]*><\/span>|<br\s*\/?>)?\s*<\/p>|<hr\b[^>]*>))*/i;
