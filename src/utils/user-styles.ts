// Estilos de UTILIZADOR: classes guardadas na secção de estilos personalizados do livro (book-css.ts) e aplicadas ao HTML.
// Três tipos com a mesma interface — parágrafo `p-nome`, caracteres `c-nome` (span), caixa `b-nome` (div.box). Único module que
// sabe as convenções (prefixo, nome para mostrar, onde a classe vive no HTML); nada aqui conhece o TinyMCE.
import { customStyleClasses } from './book-css';

export interface UserStyleKind {
    /** A classe é deste tipo? (parágrafo: qualquer uma que não seja de caracteres nem de caixa — só faz sentido sobre classes da secção.) */
    isStyle(cls: string): boolean;
    /** "Destaque forte" → "c-destaque-forte" ('' se não sobrar nada utilizável). */
    classOf(name: string): string;
    /** Nome para mostrar ("c-destaque" → "destaque"; parágrafo mostra a classe). */
    label(cls: string): string;
    /** Nome livre para a cópia de `cls`: `…-copia`, `…-copia-2`… */
    clone(existing: string[], cls: string): string;
    /** Estilos deste tipo no CSS do livro. */
    list(css: string): string[];
    /** Onde o estilo foi retirado/renomeado, para a mensagem ("do texto"). */
    where: string;
    /** Tira o estilo `cls` do HTML do livro. O mesmo HTML se ninguém o usa (sem reserializar). */
    removeFromHtml(html: string, cls: string): string;
    /** Muda a classe `from` para `to` no HTML do livro. O mesmo HTML se ninguém a usa. */
    renameInHtml(html: string, from: string, to: string): string;
}

const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Aplica `change` a cada elemento `selector` do HTML; devolve o mesmo HTML se não há nenhum (sem reserializar). */
function changeElements(html: string, cls: string, selector: string, change: (el: Element) => void): string {
    if (!html.includes(cls)) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const used = Array.from(doc.body.querySelectorAll(selector));
    if (used.length === 0) return html;
    used.forEach(change);
    return doc.body.innerHTML;
}

const dropClass = (el: Element, cls: string) => {
    el.classList.remove(cls);
    if (!el.getAttribute('class')) el.removeAttribute('class');
};

function kind(opts: {
    prefix: string; where: string; selector: (cls: string) => string; isStyle?: (cls: string) => boolean;
    label?: (cls: string) => string; drop?: (el: Element, cls: string) => void;
}): UserStyleKind {
    const { prefix, where, selector } = opts;
    const isStyle = opts.isStyle ?? ((cls: string) => cls.startsWith(prefix));
    const drop = opts.drop ?? dropClass;
    return {
        isStyle,
        classOf: (name) => { const s = slug(name).replace(new RegExp(`^${prefix}`), ''); return s ? `${prefix}${s}` : ''; },
        label: opts.label ?? ((cls) => cls.slice(prefix.length)),
        clone(existing, cls) {
            const base = `${cls}-copia`;
            if (!existing.includes(base)) return base;
            let n = 2;
            while (existing.includes(`${base}-${n}`)) n++;
            return `${base}-${n}`;
        },
        list: (css) => customStyleClasses(css).filter(isStyle),
        where,
        removeFromHtml: (html, cls) => changeElements(html, cls, selector(cls), (el) => drop(el, cls)),
        renameInHtml: (html, from, to) => changeElements(html, from, selector(from), (el) => { el.classList.replace(from, to); }),
    };
}

export const charStyles = kind({
    prefix: 'c-', where: 'do texto', selector: (cls) => `span.${cls}`,
    // O span que só tinha essa classe desembrulha-se; se tinha mais classes ou style, só perde a classe.
    drop: (span, cls) => {
        dropClass(span, cls);
        if (span.attributes.length === 0) span.replaceWith(...Array.from(span.childNodes));
    },
});

export const boxStyles = kind({ prefix: 'b-', where: 'das caixas', selector: (cls) => `.box.${cls}` });

export const paragraphStyles = kind({
    prefix: '', where: 'dos parágrafos', selector: (cls) => `.${cls}`,
    isStyle: (cls) => !charStyles.isStyle(cls) && !boxStyles.isStyle(cls),
    label: (cls) => cls, // o painel mostra a classe inteira
});

export const USER_STYLES = { paragraph: paragraphStyles, char: charStyles, box: boxStyles } as const;
export type UserStyleKindName = keyof typeof USER_STYLES;
