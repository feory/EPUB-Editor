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
    borderColor: string;      // #rrggbb — caixa à volta do texto (a largura liga o contorno; ver selectionToCss)
    borderWidth: Len | null;
    radius: Len | null;
    padding: Len | null;
    underlineStyle: string;   // double | dotted | dashed | wavy ('' = normal)
    underlineColor: string;   // #rrggbb
    underlineThickness: Len | null;
    transform: string;        // lowercase | capitalize
    weight: string;           // 300 | 400 | 500 | 600 | 800 | 900
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
    // Sublinhado e rasurado partilham text-decoration: juntam-se numa só declaração (senão uma anulava a outra).
    // Um sublinhado personalizado só se vê com o sublinhado ligado.
    const custom = sel.underlineStyle || sel.underlineColor || sel.underlineThickness;
    const lines = ['underline', 'strikethrough'].filter((f) => sel.formats.includes(f) || (f === 'underline' && custom)).map((f) => (f === 'underline' ? 'underline' : 'line-through'));
    const decls: string[] = sel.formats.flatMap((f) => (f === 'underline' || f === 'strikethrough' ? [] : FORMAT_CSS[f] ? [FORMAT_CSS[f]] : []));
    if (lines.length) decls.push(`text-decoration: ${lines.join(' ')}`);
    for (const k of KEYS) {
        const v = sel[k];
        if (v === '' || v === null) continue;
        decls.push(`${FIELDS[k][0]}: ${typeof v === 'object' ? `${v.n}${v.u}` : v}`);
    }
    if (sel.borderColor || sel.borderWidth) decls.push('border-style: solid');
    // a caixa repete-se em cada linha quando o texto quebra
    if (sel.borderColor || sel.borderWidth || sel.radius || sel.padding) decls.push('-webkit-box-decoration-break: clone', 'box-decoration-break: clone');
    return decls.map((d) => `${d};`).join(' ');
}

/**
 * O inverso de selectionToCss: lê as declarações de um estilo de caracteres para os controlos do painel. O que os controlos
 * não representam (nomes de cor, %, propriedades alheias…) volta em `rest` e é preservado ao guardar.
 */
export function cssToSelection(body: string): { selection: SelectionInfo; rest: string[] } {
    const decls = body.split(';').map((d) => d.trim()).filter(Boolean).map((d): [string, string] => {
        const i = d.indexOf(':');
        return [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()];
    });
    const formats = new Set<string>();
    const rest: string[] = [];
    const sel: SelectionInfo = { ...EMPTY_SELECTION, formats: [] };
    let smaller = false;
    for (const [name, value] of decls) {
        const v = value.toLowerCase();
        const keep = () => rest.push(`${name}: ${value}`);
        if (name === 'font-weight') { if (v === 'bold' || v === '700') formats.add('bold'); else if (WEIGHTS.some(([x]) => x && x === v)) sel.weight = v; else keep(); }
        else if (name === 'font-style') { if (v === 'italic') formats.add('italic'); else keep(); }
        else if (name === 'text-decoration') {
            const tokens = v.split(/\s+/);
            if (tokens.every((t) => t === 'underline' || t === 'line-through')) tokens.forEach((t) => formats.add(t === 'underline' ? 'underline' : 'strikethrough'));
            else keep();
        } else if (name === 'vertical-align') { if (v === 'super') formats.add('superscript'); else if (v === 'sub') formats.add('subscript'); else keep(); }
        else if (name === 'font-variant') { if (v === 'small-caps') formats.add('small-caps'); else keep(); }
        else if (name === 'text-transform') { if (v === 'uppercase') formats.add('uppercase'); else if (TRANSFORMS.some(([x]) => x && x === v)) sel.transform = v; else keep(); }
        else if (name === 'color' || name === 'background-color') {
            const hex = toHex(value);
            if (hex) sel[name === 'color' ? 'color' : 'background'] = hex; else keep();
        } else if (name === 'border-color' || name === 'text-decoration-color') {
            const hex = toHex(value);
            if (hex) sel[name === 'border-color' ? 'borderColor' : 'underlineColor'] = hex; else keep();
        } else if (name === 'border-width' || name === 'border-radius' || name === 'padding' || name === 'text-decoration-thickness') {
            const len = parseLen(v);
            const key = { 'border-width': 'borderWidth', 'border-radius': 'radius', padding: 'padding', 'text-decoration-thickness': 'underlineThickness' }[name] as 'borderWidth' | 'radius' | 'padding' | 'underlineThickness';
            if (len) sel[key] = len; else keep();
        } else if (name === 'border-style' && v === 'solid') { /* implícito em borderColor/borderWidth */ }
        else if ((name === '-webkit-box-decoration-break' || name === 'box-decoration-break') && v === 'clone') { /* idem */ }
        else if (name === 'text-decoration-style') { if (UNDERLINE_STYLES.some(([x]) => x && x === v)) sel.underlineStyle = v; else keep(); }
        else if (name === 'font-size') {
            const len = parseLen(v);
            if (v === 'smaller') smaller = true; else if (len) sel.fontSize = len; else keep();
        } else if (name === 'letter-spacing') {
            const len = parseLen(v);
            if (len) sel.letterSpacing = len; else keep();
        } else if (name === 'font-family') {
            if (FONT_FAMILIES.some(([f]) => f && f === v)) sel.fontFamily = v; else keep();
        } else keep();
    }
    // `font-size: smaller` acompanha sobrescrito/subscrito (ver FORMAT_CSS); sozinho é o "texto pequeno".
    if (smaller && !formats.has('superscript') && !formats.has('subscript')) formats.add('small-text');
    sel.formats = INLINE_FORMATS.map(([f]) => f as string).filter((f) => formats.has(f));
    return { selection: sel, rest };
}

export const EMPTY_SELECTION: SelectionProps = {
    color: '', background: '', fontSize: null, letterSpacing: null, fontFamily: '',
    borderColor: '', borderWidth: null, radius: null, padding: null,
    underlineStyle: '', underlineColor: '', underlineThickness: null, transform: '', weight: '',
};

export const UNDERLINE_STYLES = [['', 'Normal'], ['double', 'Duplo'], ['dotted', 'Ponteado'], ['dashed', 'Tracejado'], ['wavy', 'Ondulado']] as const;
export const TRANSFORMS = [['', 'Nenhuma'], ['lowercase', 'minúsculas'], ['capitalize', 'Cada Palavra']] as const;
export const WEIGHTS = [['', 'Padrão'], ['300', 'Leve'], ['400', 'Normal'], ['500', 'Médio'], ['600', 'Seminegrito'], ['800', 'Extranegrito'], ['900', 'Preto']] as const;

export const FONT_FAMILIES = [['', 'Padrão'], ['serif', 'Serifa'], ['sans-serif', 'Sem serifa'], ['monospace', 'Monoespaçada']] as const;

// chave → [propriedade CSS, formato do TinyMCE (formats.ts regista o 'letterspacing'; os outros são nativos)]
const FIELDS: { [K in keyof SelectionProps]: [string, string] } = {
    color: ['color', 'forecolor'],
    background: ['background-color', 'hilitecolor'],
    fontSize: ['font-size', 'fontsize'],
    letterSpacing: ['letter-spacing', 'letterspacing'],
    fontFamily: ['font-family', 'fontname'],
    borderColor: ['border-color', 'bordercolor'],
    borderWidth: ['border-width', 'borderwidth'],
    radius: ['border-radius', 'borderradius'],
    padding: ['padding', 'charpadding'],
    underlineStyle: ['text-decoration-style', 'underlinestyle'],
    underlineColor: ['text-decoration-color', 'underlinecolor'],
    underlineThickness: ['text-decoration-thickness', 'underlinethickness'],
    transform: ['text-transform', 'texttransform'],
    weight: ['font-weight', 'fontweight'],
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
        borderColor: toHex(get('borderColor')),
        borderWidth: parseLen(get('borderWidth')),
        radius: parseLen(get('radius')),
        padding: parseLen(get('padding')),
        underlineStyle: UNDERLINE_STYLES.some(([x]) => x && x === get('underlineStyle')) ? get('underlineStyle') : '',
        underlineColor: toHex(get('underlineColor')),
        underlineThickness: parseLen(get('underlineThickness')),
        transform: TRANSFORMS.some(([x]) => x && x === get('transform')) ? get('transform') : '',
        weight: WEIGHTS.some(([x]) => x && x === get('weight')) ? get('weight') : '',
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
