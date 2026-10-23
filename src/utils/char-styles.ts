// Estilo de CARACTERES: classe `c-nome` na secção de estilos do livro (book-css.ts), aplicada à seleção como
// `<span class="c-nome">`. É o único módulo que sabe a convenção (prefixo, nome para mostrar, forma do formato inline);
// os estilos de parágrafo usam `p-` (styleClassOf em book-css.ts).
const PREFIX = 'c-';

export const isCharStyle = (cls: string): boolean => cls.startsWith(PREFIX);

/** "Destaque forte" → "c-destaque-forte" ('' se não sobrar nada utilizável). */
export function charStyleClassOf(name: string): string {
    const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^c-/, '');
    return slug ? `${PREFIX}${slug}` : '';
}

/** Nome para mostrar ("c-destaque" → "destaque"). */
export const charStyleLabel = (cls: string): string => cls.slice(PREFIX.length);

/** O formato inline (TinyMCE) de um estilo de caracteres: o nome do formato é a própria classe. */
export const charStyleFormat = (cls: string): { inline: 'span'; classes: string } => ({ inline: 'span', classes: cls });

/**
 * Tira o estilo `cls` do HTML do livro: o span que só tinha essa classe desembrulha-se; se tinha mais classes ou style,
 * só perde a classe. Devolve o mesmo HTML se o estilo não é usado (sem reserializar).
 */
export function removeCharStyleFromHtml(html: string, cls: string): string {
    if (!html.includes(cls)) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const used = Array.from(doc.body.querySelectorAll(`span.${cls}`));
    if (used.length === 0) return html;
    for (const span of used) {
        span.classList.remove(cls);
        if (!span.getAttribute('class')) span.removeAttribute('class');
        if (span.attributes.length === 0) span.replaceWith(...Array.from(span.childNodes));
    }
    return doc.body.innerHTML;
}
