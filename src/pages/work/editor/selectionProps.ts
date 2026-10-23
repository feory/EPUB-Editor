// Atributos de uma SELEÇÃO de texto (caracteres dentro de um bloco): vêm de <span style> inline, escritos pelo
// formatter do TinyMCE. '' / null = sem valor próprio (herda do bloco/livro). Escolhemos o formato por propriedade
// para que mudar uma não mexa nas outras.
import { parseLen, type Len } from './textProps';

export interface SelectionProps {
    color: string;            // #rrggbb
    background: string;       // #rrggbb
    fontSize: Len | null;
    letterSpacing: Len | null;
    fontFamily: string;       // família genérica (serif…): segura num EPUB, ao contrário de um nome de fonte
}

/** O que o painel mostra da seleção: propriedades de estilo + formatos inline ligados (negrito, itálico…). */
export type SelectionInfo = SelectionProps & { formats: string[] };

/** Formatos inline ligáveis/desligáveis (nomes dos formatos do TinyMCE), por ordem no painel. */
export const INLINE_FORMATS = [
    ['bold', 'Negrito'], ['italic', 'Itálico'], ['underline', 'Sublinhado'], ['strikethrough', 'Rasurado'],
    ['superscript', 'Sobrescrito'], ['subscript', 'Subscrito'],
    ['small-caps', 'Versaletes'], ['small-text', 'Texto pequeno'], ['uppercase', 'Maiúsculas'],
] as const;

// Formato inline → declaração CSS equivalente (para criar um estilo de caracteres a partir da seleção).
const FORMAT_CSS: Record<string, string> = {
    bold: 'font-weight: bold', italic: 'font-style: italic', underline: 'text-decoration: underline', strikethrough: 'text-decoration: line-through',
    superscript: 'vertical-align: super; font-size: smaller', subscript: 'vertical-align: sub; font-size: smaller',
    'small-caps': 'font-variant: small-caps', 'small-text': 'font-size: smaller', uppercase: 'text-transform: uppercase',
};

/** O que a seleção tem agora (formatos + aspeto) como declarações CSS de uma regra; '' se não tem nada. */
export function selectionToCss(sel: SelectionInfo): string {
    const decls: string[] = sel.formats.flatMap((f) => (FORMAT_CSS[f] ? [FORMAT_CSS[f]] : []));
    for (const k of KEYS) {
        const v = sel[k];
        if (v === '' || v === null) continue;
        decls.push(`${FIELDS[k][0]}: ${typeof v === 'object' ? `${v.n}${v.u}` : v}`);
    }
    return decls.map((d) => `${d};`).join(' ');
}

export const EMPTY_SELECTION: SelectionProps = { color: '', background: '', fontSize: null, letterSpacing: null, fontFamily: '' };

export const FONT_FAMILIES = [['', 'Padrão'], ['serif', 'Serifa'], ['sans-serif', 'Sem serifa'], ['monospace', 'Monoespaçada']] as const;

// chave → [propriedade CSS, formato do TinyMCE (formats.ts regista o 'letterspacing'; os outros são nativos)]
const FIELDS: { [K in keyof SelectionProps]: [string, string] } = {
    color: ['color', 'forecolor'],
    background: ['background-color', 'hilitecolor'],
    fontSize: ['font-size', 'fontsize'],
    letterSpacing: ['letter-spacing', 'letterspacing'],
    fontFamily: ['font-family', 'fontname'],
};
const KEYS = Object.keys(FIELDS) as (keyof SelectionProps)[];

/** "rgb(255, 224, 102)" | "#ffe066" → "#ffe066"; o resto (nomes, transparent) → ''. */
export function toHex(v: string): string {
    const hex = /^#([0-9a-f]{6})$/i.exec(v.trim());
    if (hex) return `#${hex[1].toLowerCase()}`;
    const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v.trim());
    return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '';
}

export function readSelectionProps(read: (cssName: string) => string): SelectionProps {
    const get = (k: keyof SelectionProps) => read(FIELDS[k][0]).trim();
    const family = get('fontFamily').toLowerCase();
    return {
        color: toHex(get('color')),
        background: toHex(get('background')),
        fontSize: parseLen(get('fontSize')),
        letterSpacing: parseLen(get('letterSpacing')),
        fontFamily: FONT_FAMILIES.some(([v]) => v && v === family) ? family : '',
    };
}

/** Patch → o que pedir ao formatter: formato, propriedade CSS (para saber o valor atual ao remover) e valor | null (remover). */
export function selectionPatchOps(patch: Partial<SelectionProps>): { format: string; css: string; value: string | null }[] {
    return KEYS.filter((k) => k in patch).map((k) => {
        const v = patch[k];
        const value = v === null || v === undefined || v === '' ? null : typeof v === 'object' ? `${v.n}${v.u}` : v;
        return { format: FIELDS[k][1], css: FIELDS[k][0], value };
    });
}
