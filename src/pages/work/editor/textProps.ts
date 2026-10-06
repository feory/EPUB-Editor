// Atributos de um bloco de texto (p, h1-h6, li…): vêm do style inline do bloco ("Este bloco")
// ou da regra CSS do livro ("Estilo"). '' / null = sem valor próprio (herda).

export type TextAlign = '' | 'left' | 'center' | 'right' | 'justify';

export interface TextProps {
    align: TextAlign;
    indent: number | null;       // em, 1.ª linha
    marginLeft: number | null;   // em
    fontSize: number | null;     // em
    lineHeight: number | null;   // em
    marginTop: number | null;    // em
    marginBottom: number | null; // em
    color: string;
}

export const EMPTY_TEXT: TextProps = { align: '', indent: null, marginLeft: null, fontSize: null, lineHeight: null, marginTop: null, marginBottom: null, color: '' };

// chave → [propriedade CSS, unidade]
const FIELDS: { [K in keyof TextProps]: [string, string] } = {
    align: ['text-align', ''], indent: ['text-indent', 'em'], marginLeft: ['margin-left', 'em'],
    fontSize: ['font-size', 'em'], lineHeight: ['line-height', 'em'],
    marginTop: ['margin-top', 'em'], marginBottom: ['margin-bottom', 'em'], color: ['color', ''],
};
const KEYS = Object.keys(FIELDS) as (keyof TextProps)[];

// Só valores em em são representáveis nos campos (px/% de CSS escrito à mão ficam vazios).
export function textPropsFrom(get: (cssName: string) => string): TextProps {
    const out: Record<string, string | number | null> = {};
    for (const k of KEYS) {
        const [name, unit] = FIELDS[k];
        const v = get(name).replace(/\s*!important\s*$/i, '').trim();
        out[k] = unit ? (v === '0' || (v.endsWith(unit) && !isNaN(parseFloat(v))) ? parseFloat(v) : null) : v;
    }
    return out as unknown as TextProps;
}

// Patch → declarações CSS [propriedade, valor | null (remover)].
export function textPatchToDecls(patch: Partial<TextProps>): [string, string | null][] {
    return KEYS.filter((k) => k in patch).map((k) => {
        const [name, unit] = FIELDS[k];
        const v = patch[k];
        return [name, v === null || v === undefined || v === '' ? null : `${v}${unit}`];
    });
}

export interface TextBlockInfo { tag: string; classes: string[]; inline: TextProps }
export interface BlockInfo { box: import('./boxProps').BoxProps | null; text: TextBlockInfo | null }

// Escrita inline: !important porque as classes de parágrafo do livro (.p-center…) usam !important
// e, sem ele, o inline nunca as vence.
export interface TextDom { setStyle(el: HTMLElement, name: string, value: string | null): void }

export function applyTextProps(dom: TextDom, el: HTMLElement, patch: Partial<TextProps>): void {
    textPatchToDecls(patch).forEach(([name, value]) => dom.setStyle(el, name, value));
}
