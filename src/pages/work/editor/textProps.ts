// Atributos de um bloco de texto (p, h1-h6, li…): vêm do style inline do bloco ("Este bloco")
// ou da regra CSS do livro ("Estilo"). '' / null = sem valor próprio (herda).

export type TextAlign = '' | 'left' | 'center' | 'right' | 'justify';

/** Medida com a unidade em que o CSS a escreveu (px ou em) — nunca se converte às escondidas. */
export type Unit = 'px' | 'em';
export interface Len { n: number; u: Unit }
export const PX_PER_EM = 16;
export const convertLen = (l: Len, u: Unit): Len =>
    l.u === u ? l : { n: Math.round((u === 'px' ? l.n * PX_PER_EM : l.n / PX_PER_EM) * 100) / 100, u };

export interface TextProps {
    align: TextAlign;
    indent: Len | null;       // 1.ª linha
    marginLeft: Len | null;
    fontSize: Len | null;
    lineHeight: Len | null;
    marginTop: Len | null;
    marginBottom: Len | null;
    color: string;
}

export const EMPTY_TEXT: TextProps = { align: '', indent: null, marginLeft: null, fontSize: null, lineHeight: null, marginTop: null, marginBottom: null, color: '' };

// chave → propriedade CSS
const FIELDS: { [K in keyof TextProps]: string } = {
    align: 'text-align', indent: 'text-indent', marginLeft: 'margin-left',
    fontSize: 'font-size', lineHeight: 'line-height',
    marginTop: 'margin-top', marginBottom: 'margin-bottom', color: 'color',
};
const KEYS = Object.keys(FIELDS) as (keyof TextProps)[];
const LEN_KEYS = new Set<keyof TextProps>(['indent', 'marginLeft', 'fontSize', 'lineHeight', 'marginTop', 'marginBottom']);

// px e em (rem conta como em) são representáveis; % e outras unidades de CSS escrito à mão ficam vazios.
export function parseLen(v: string): Len | null {
    const m = /^(-?\d*\.?\d+)(px|r?em)?$/.exec(v);
    if (!m || (!m[2] && Number(m[1]) !== 0)) return null; // número sem unidade só vale se for 0
    return { n: Number(m[1]), u: m[2] === 'px' ? 'px' : 'em' };
}

export function textPropsFrom(get: (cssName: string) => string): TextProps {
    const out: Record<string, string | Len | null> = {};
    for (const k of KEYS) {
        const v = get(FIELDS[k]).replace(/\s*!important\s*$/i, '').trim();
        out[k] = LEN_KEYS.has(k) ? parseLen(v) : v;
    }
    return out as unknown as TextProps;
}

// Patch → declarações CSS [propriedade, valor | null (remover)].
export function textPatchToDecls(patch: Partial<TextProps>): [string, string | null][] {
    return KEYS.filter((k) => k in patch).map((k) => {
        const v = patch[k];
        if (v === null || v === undefined || v === '') return [FIELDS[k], null];
        return [FIELDS[k], typeof v === 'object' ? `${v.n}${v.u}` : v];
    });
}

export interface TextBlockInfo { tag: string; classes: string[]; inline: TextProps }

// Escrita inline: !important porque as classes de parágrafo do livro (.p-center…) usam !important
// e, sem ele, o inline nunca as vence.
export interface TextDom { setStyle(el: HTMLElement, name: string, value: string | null): void }

export function applyTextProps(dom: TextDom, el: HTMLElement, patch: Partial<TextProps>): void {
    textPatchToDecls(patch).forEach(([name, value]) => dom.setStyle(el, name, value));
}
