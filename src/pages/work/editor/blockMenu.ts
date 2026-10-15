// Ações do menu "⋮" de um elemento (bloco de texto ou imagem): operações puras sobre o DOM.
// O hook (useBlockOverlays) trata do passo de undo, do cursor e da área de transferência.

import { CONTAINER_SELECTOR } from '../../../utils/containers';

export interface StyleSnapshot { classes: string[]; style: string }

const UI_CLASS = /^(mce-|diff-|chapter-break)/;

/** O bloco que contém o elemento: uma imagem num parágrafo age sobre o parágrafo. */
export const blockOf = (el: Element): Element => (el.nodeName === 'IMG' && el.parentElement?.nodeName === 'P' ? el.parentElement : el);

/** Cópia sem marcas de UI do editor (data-mce-*), pronta a inserir ou a ir para a área de transferência. */
export function cleanClone(el: Element): Element {
    const clone = el.cloneNode(true) as Element;
    for (const node of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
        for (const attr of Array.from(node.attributes)) if (attr.name.startsWith('data-mce-')) node.removeAttribute(attr.name);
    }
    return clone;
}

export const copyHtml = (el: Element): string => cleanClone(blockOf(el)).outerHTML;

export function duplicate(el: Element): Element {
    const block = blockOf(el);
    const clone = cleanClone(block);
    block.after(clone);
    return clone;
}

export function insertEmptyParagraph(el: Element, where: 'before' | 'after'): Element {
    const p = el.ownerDocument.createElement('p');
    p.innerHTML = '<br data-mce-bogus="1">';
    blockOf(el)[where](p);
    return p;
}

export function snapshotStyles(el: Element): StyleSnapshot {
    const block = blockOf(el);
    return { classes: Array.from(block.classList).filter((c) => !UI_CLASS.test(c)), style: block.getAttribute('style') ?? '' };
}

/** Aplica classes e style copiados (substitui os do bloco; as classes de UI ficam). */
export function applyStyles(el: Element, snap: StyleSnapshot): void {
    const block = blockOf(el);
    Array.from(block.classList).filter((c) => !UI_CLASS.test(c)).forEach((c) => block.classList.remove(c));
    snap.classes.forEach((c) => block.classList.add(c));
    block.removeAttribute('data-mce-style'); // o TinyMCE serializa-o de preferência ao style
    if (snap.style) block.setAttribute('style', snap.style); else block.removeAttribute('style');
    if (!block.getAttribute('class')) block.removeAttribute('class');
}

/** Caixa onde o bloco já está (Desagrupar), se houver; se o próprio elemento é uma caixa, é ela. */
export const boxOf = (el: Element): Element | null => {
    const block = blockOf(el);
    return block.classList.contains('box') ? block : block.parentElement?.closest('.box') ?? null;
};

/** Agrupar: envolve o bloco numa caixa nova. */
export function groupInBox(el: Element): Element {
    const block = blockOf(el);
    const box = block.ownerDocument.createElement('div');
    box.className = 'box';
    block.replaceWith(box);
    box.append(block);
    return box;
}

/** Desagrupar: a caixa desaparece e os filhos ficam no lugar dela. Devolve o 1.º filho. */
export function ungroup(box: Element): Element | null {
    const first = box.firstElementChild;
    box.replaceWith(...Array.from(box.childNodes));
    return first;
}

/** Contentor (colunas/caixa) à volta do elemento, se houver. */
export const containerOf = (el: Element): HTMLElement | null => el.parentElement?.closest(CONTAINER_SELECTOR) as HTMLElement | null;
