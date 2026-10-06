// Blocos-contentor do editor (colunas, caixa): markup, seletor e invariantes num só sítio.
// Invariante principal: uma coluna nunca fica sem parágrafo — sem ele não se consegue editar.

export const COLUMNS_HTML = '<div class="columns"><div class="col"><p><br></p></div><div class="col"><p><br></p></div></div>';

export const CONTAINER_SELECTOR = '.columns, .box';

/** Único parágrafo de uma coluna: não pode ser apagado por estar vazio (o limpador mantém-no). */
export const isColumnPlaceholder = (p: Element): boolean =>
    !!p.parentElement?.classList.contains('col') && p.parentElement.children.length === 1;

/**
 * Remove o elemento mantendo os invariantes: imagem sozinha no parágrafo leva o parágrafo; contentor
 * que fica vazio sai (caixa) ou ganha um parágrafo vazio (coluna). Devolve o vizinho para pôr o cursor.
 */
export function removeElement(el: Element, body: Element): Element | null {
    const p = el.parentElement;
    const doomed = el.nodeName === 'IMG' && p && p !== body && p.querySelectorAll('img').length === 1 && !p.textContent?.trim() ? p : el;
    const parent = doomed.parentElement;
    const next = doomed.nextElementSibling ?? doomed.previousElementSibling;
    doomed.remove();
    let holder = parent;
    // Vazio = sem elementos E sem texto (um <p> com texto e sem filhos não é vazio).
    while (holder && holder !== body && !holder.children.length && !holder.textContent?.trim()) {
        if (holder.classList.contains('col')) { holder.innerHTML = '<p><br data-mce-bogus="1"></p>'; break; }
        const up: HTMLElement | null = holder.parentElement;
        holder.remove();
        holder = up;
    }
    return next;
}
