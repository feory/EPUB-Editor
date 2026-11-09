import { boxStyles } from '../../../utils/user-styles';

// Atributos de UMA caixa (div.box): variante = classe `box--X`; estilos de caixa = classes `b-nome`; o resto = style inline.
// '' / null = sem valor próprio (herda da regra .box do CSS do livro).

export const BOX_VARIANTS = [['', 'Padrão'], ['destaque', 'Destaque'], ['aviso', 'Aviso'], ['nota', 'Nota']] as const;
export type BoxVariant = typeof BOX_VARIANTS[number][0];
export type BoxBorderStyle = '' | 'solid' | 'dashed' | 'dotted';

export interface BoxProps {
    variant: BoxVariant;
    classes: string[];          // estilos de caixa aplicados (`b-nome`)
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
        classes: Array.from(el.classList).filter(boxStyles.isStyle),
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
    if ('classes' in patch) {
        Array.from(el.classList).filter(boxStyles.isStyle).forEach((c) => dom.removeClass(el, c));
        patch.classes?.forEach((c) => dom.addClass(el, c));
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

// Propriedades da caixa ↔ declarações CSS de um estilo de caixa (a variante e as classes ficam de fora: são da caixa, não do estilo).
const STYLE_PROPS = new Set(['background-color', 'color', 'border-color', 'border-width', 'border-style', 'border-radius', 'padding', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'width']);

/** As declarações que `patch` escreve na caixa (mesma tradução de applyBoxProps, para o CSS do estilo). */
export function boxToCss(patch: Partial<BoxProps>): string {
    const decls = new Map<string, string>();
    const dom: BoxDom = { setStyle: (_el, name, value) => { if (value) decls.set(name, value); }, addClass() {}, removeClass() {} };
    const style = { ...patch }; // variante e classes são da caixa, não do estilo
    delete style.variant;
    delete style.classes;
    applyBoxProps(dom, null as unknown as HTMLElement, style); // sem variante/classes o elemento não é tocado
    return [...decls].map(([n, v]) => `${n}: ${v};`).join(' ');
}

/** O corpo CSS de um estilo → propriedades da caixa, e `rest` = declarações que os controlos não representam (mantêm-se ao guardar). */
export function cssToBox(body: string): { box: BoxProps; rest: string[] } {
    const d: Record<string, string> = {};
    const rest: string[] = [];
    for (const decl of body.split(';').map((x) => x.trim()).filter(Boolean)) {
        const i = decl.indexOf(':');
        const name = decl.slice(0, i).trim().toLowerCase();
        if (STYLE_PROPS.has(name)) d[name] = decl.slice(i + 1).trim(); else rest.push(decl);
    }
    return {
        rest,
        box: {
            variant: '', classes: [], background: d['background-color'] ?? '', color: d.color ?? '', borderColor: d['border-color'] ?? '',
            borderWidth: num(d['border-width'] ?? ''), borderStyle: (d['border-style'] as BoxBorderStyle) || '', radius: num(d['border-radius'] ?? ''),
            padding: num(d.padding ?? ''), marginY: num(d['margin-top'] ?? ''), width: num(d.width ?? ''),
        },
    };
}
