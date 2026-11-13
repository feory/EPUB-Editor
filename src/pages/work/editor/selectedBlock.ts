// Quais são os blocos de topo de texto selecionados (para o assistente de IA limitar o pedido a eles). Puro: recebe o corpo e o intervalo.
import { blockKey, MAX_BLOCKS } from '../../../utils/book-rules';
import type { SelectedBlocks } from '../ai/aiSelection';

const isMarker = (el: Element) => /\bchapter-(break|anchor)/.test(el.className);
const TEXT_TOP = /^(p|h[1-6])$/;
/** O intervalo da seleção (o que o `Range` do DOM tem). */
export interface RangeLike { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number; collapsed: boolean }

const topOf = (body: HTMLElement, node: Node | null): Element | null => {
    let top: Node | null = node;
    while (top && top.parentNode !== body) top = top.parentNode;
    return top?.nodeType === 1 ? (top as Element) : null;
};

/** O fim da seleção está no início de um bloco (p. ex. triplo clique): esse bloco não entra. */
const endsAtStartOf = (top: Element, node: Node, offset: number) => {
    if (offset !== 0) return false;
    for (let n: Node = node; n !== top; n = n.parentNode!) if (n.parentNode!.firstChild !== n) return false;
    return true;
};

/**
 * Null se a seleção sai de blocos de topo de texto (caixa, tabela, lista, imagem, marcador de capítulo/âncora, bloco vazio) ou
 * apanha mais de MAX_BLOCKS blocos.
 */
export function selectedTopBlocks(body: HTMLElement, range: RangeLike): SelectedBlocks | null {
    const first = topOf(body, range.startContainer);
    let last = topOf(body, range.endContainer);
    if (!first || !last) return null;
    if (!range.collapsed && last !== first && endsAtStartOf(last, range.endContainer, range.endOffset)) last = last.previousElementSibling;
    if (!last) return null;
    const all = Array.from(body.children);
    let from = all.indexOf(first);
    let to = all.indexOf(last);
    if (from < 0 || to < from) return null;
    while (from < to && isMarker(all[from])) from++; // o marcador de capítulo nas pontas não conta (uma seleção que começa no topo apanha-o)
    while (to > from && isMarker(all[to])) to--;
    if (to - from + 1 > MAX_BLOCKS) return null;
    const els = all.slice(from, to + 1);
    const texts = els.map((el) => blockKey(el.textContent));
    const ok = els.every((el, i) => TEXT_TOP.test(el.tagName.toLowerCase()) && !isMarker(el) && !el.querySelector('img') && texts[i]);
    return ok ? { index: from, tags: els.map((el) => el.tagName.toLowerCase()), texts } : null;
}
