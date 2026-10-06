// Atributos de UMA imagem (<img>): alinhamento = classe img-*; o resto = style inline / alt.
// '' / null = sem valor próprio (herda de img / img.img-* no CSS do livro).

export const IMAGE_ALIGNS = [['', 'Padrão'], ['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita'], ['inline', 'Em linha']] as const;
export type ImageAlign = typeof IMAGE_ALIGNS[number][0];

export interface ImageProps {
    align: ImageAlign;
    width: number | null;        // % da coluna
    marginTop: number | null;    // em
    marginBottom: number | null; // em
    offsetY: number | null;      // px (translateY)
    alt: string;
}

export const EMPTY_IMAGE: ImageProps = { align: '', width: null, marginTop: null, marginBottom: null, offsetY: null, alt: '' };

// Subconjunto de editor.dom (style via dom mantém o data-mce-style do TinyMCE em sincronia).
export interface ImageDom {
    setStyle(el: HTMLElement, name: string, value: string | null): void;
    setAttrib(el: HTMLElement, name: string, value: string | null): void;
    addClass(el: HTMLElement, cls: string): void;
    removeClass(el: HTMLElement, cls: string): void;
}

const num = (v: string) => (v ? parseFloat(v) : null);

export function readImageProps(el: HTMLElement): ImageProps {
    const s = el.style;
    return {
        align: IMAGE_ALIGNS.find(([a]) => a && el.classList.contains(`img-${a}`))?.[0] ?? '',
        width: s.width.endsWith('%') ? num(s.width) : null, // largura em px (resize do TinyMCE) não é representável
        marginTop: num(s.marginTop),
        marginBottom: num(s.marginBottom),
        offsetY: num(/translateY\((-?[\d.]+)px\)/.exec(s.transform)?.[1] ?? ''),
        alt: el.getAttribute('alt') ?? '',
    };
}

const unit = (v: number | null | undefined, u: string) => (v === null || v === undefined ? null : `${v}${u}`);

export function applyImageProps(dom: ImageDom, el: HTMLElement, patch: Partial<ImageProps>): void {
    if ('align' in patch) {
        IMAGE_ALIGNS.forEach(([a]) => a && dom.removeClass(el, `img-${a}`));
        if (patch.align) dom.addClass(el, `img-${patch.align}`);
    }
    if ('width' in patch) {
        // Largura em % substitui o tamanho em px do resize (atributo width + height inline).
        dom.setStyle(el, 'width', unit(patch.width, '%'));
        dom.setStyle(el, 'height', patch.width == null ? null : 'auto');
        dom.setAttrib(el, 'width', null);
        dom.setAttrib(el, 'height', null);
    }
    if ('marginTop' in patch) dom.setStyle(el, 'margin-top', unit(patch.marginTop, 'em'));
    if ('marginBottom' in patch) dom.setStyle(el, 'margin-bottom', unit(patch.marginBottom, 'em'));
    if ('offsetY' in patch) dom.setStyle(el, 'transform', patch.offsetY == null ? null : `translateY(${patch.offsetY}px)`);
    if ('alt' in patch) dom.setAttrib(el, 'alt', patch.alt ?? '');
}
