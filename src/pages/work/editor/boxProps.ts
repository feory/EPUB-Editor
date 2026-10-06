// Atributos de UMA caixa (div.box): variante = classe `box--X`; o resto = style inline.
// '' / null = sem valor próprio (herda da regra .box do CSS do livro).

export const BOX_VARIANTS = [['', 'Padrão'], ['destaque', 'Destaque'], ['aviso', 'Aviso'], ['nota', 'Nota']] as const;
export type BoxVariant = typeof BOX_VARIANTS[number][0];
export type BoxBorderStyle = '' | 'solid' | 'dashed' | 'dotted';

export interface BoxProps {
    variant: BoxVariant;
    background: string;
    color: string;
    borderColor: string;
    borderWidth: number | null; // px
    borderStyle: BoxBorderStyle;
    radius: number | null;      // px
    padding: number | null;     // em
    marginY: number | null;     // em (cima e baixo)
    width: number | null;       // % (centrada quando < 100)
}

// Subconjunto de editor.dom — escrever style por aqui mantém o data-mce-style do TinyMCE em sincronia.
export interface BoxDom {
    setStyle(el: HTMLElement, name: string, value: string | null): void;
    addClass(el: HTMLElement, cls: string): void;
    removeClass(el: HTMLElement, cls: string): void;
}

const num = (v: string) => (v ? parseFloat(v) : null);

export function readBoxProps(el: HTMLElement): BoxProps {
    const s = el.style;
    return {
        variant: BOX_VARIANTS.find(([v]) => v && el.classList.contains(`box--${v}`))?.[0] ?? '',
        background: s.backgroundColor,
        color: s.color,
        borderColor: s.borderColor,
        borderWidth: num(s.borderWidth),
        borderStyle: (s.borderStyle as BoxBorderStyle) || '',
        radius: num(s.borderRadius),
        padding: num(s.padding),
        marginY: num(s.marginTop),
        width: num(s.width),
    };
}

const unit = (v: number | null, u: string) => (v === null ? null : `${v}${u}`);

export function applyBoxProps(dom: BoxDom, el: HTMLElement, patch: Partial<BoxProps>): void {
    const set = (name: string, value: string | null) => dom.setStyle(el, name, value || null);
    if ('variant' in patch) {
        BOX_VARIANTS.forEach(([v]) => v && dom.removeClass(el, `box--${v}`));
        if (patch.variant) dom.addClass(el, `box--${patch.variant}`);
    }
    if ('background' in patch) set('background-color', patch.background ?? null);
    if ('color' in patch) set('color', patch.color ?? null);
    if ('borderColor' in patch) set('border-color', patch.borderColor ?? null);
    if ('borderWidth' in patch) set('border-width', unit(patch.borderWidth ?? null, 'px'));
    if ('borderStyle' in patch) set('border-style', patch.borderStyle ?? null);
    if ('radius' in patch) set('border-radius', unit(patch.radius ?? null, 'px'));
    if ('padding' in patch) set('padding', unit(patch.padding ?? null, 'em'));
    if ('marginY' in patch) {
        set('margin-top', unit(patch.marginY ?? null, 'em'));
        set('margin-bottom', unit(patch.marginY ?? null, 'em'));
    }
    if ('width' in patch) {
        const w = patch.width ?? null;
        set('width', unit(w, '%'));
        const side = w !== null && w < 100 ? 'auto' : null; // centrada quando mais estreita que a coluna
        set('margin-left', side);
        set('margin-right', side);
    }
}
