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
