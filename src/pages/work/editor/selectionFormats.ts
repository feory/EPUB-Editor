// A parte do adapter TinyMCE da seleção que não precisa do editor: ler o valor inline que a seleção tem e ligar/desligar um
// formato por propriedade. Vive à parte para se testar contra um formatter que imita as manhas conhecidas do TinyMCE
// (selectionFormats.test.ts) — foi no adapter, e não nos módulos puros, que estiveram os bugs reais.

/** Subconjunto de editor.formatter que o adapter usa. */
export interface FormatterLike {
    apply(format: string, vars: { value: string }): void;
    remove(format: string, vars: { value: string | null }, node?: undefined, similar?: boolean): void;
}

/**
 * Valor CSS inline de uma propriedade na seleção, só de spans (o style do próprio bloco é "Este bloco"). Depois de aplicar um
 * formato o TinyMCE deixa o início da seleção dentro do span e o fim fora dele (getNode() sobe ao bloco): parte-se do início e,
 * sem valor, procuram-se os spans que intersetam a seleção.
 */
export function readInlineStyle(rng: Range, isBlock: (el: Element) => boolean, css: string): string {
    const start = rng.startContainer;
    for (let el: HTMLElement | null = start.nodeType === 1 ? (start as HTMLElement) : start.parentElement; el && !isBlock(el); el = el.parentElement) {
        const v = el.style.getPropertyValue(css);
        if (v) return v;
    }
    const root = rng.commonAncestorContainer;
    const scope = (root.nodeType === 1 ? root : root.parentElement) as HTMLElement | null;
    for (const el of Array.from(scope?.querySelectorAll<HTMLElement>('span[style]') ?? [])) {
        if (!rng.intersectsNode(el)) continue;
        const v = el.style.getPropertyValue(css);
        if (v) return v;
    }
    return '';
}

/** Aplica (value) ou tira (null) o formato de UMA propriedade `css` na seleção. */
export function setInlineFormat(fmt: FormatterLike, read: (css: string) => string, format: string, css: string, value: string | null): void {
    if (value) return fmt.apply(format, { value });
    fmt.remove(format, { value: null }, undefined, true);
    // Os formatos sem remove_similar (tamanho, família) só saem pelo valor exato que lá está.
    const current = read(css);
    if (current) fmt.remove(format, { value: current });
}
