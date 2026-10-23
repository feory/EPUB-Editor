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

/** Patch → o que pedir ao formatter: [formato, valor | null (remover)]. */
export function selectionPatchOps(patch: Partial<SelectionProps>): { format: string; value: string | null }[] {
    return KEYS.filter((k) => k in patch).map((k) => {
        const v = patch[k];
        const value = v === null || v === undefined || v === '' ? null : typeof v === 'object' ? `${v.n}${v.u}` : v;
        return { format: FIELDS[k][1], value };
    });
}
