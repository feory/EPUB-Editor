// Atributos de uma SELEÇÃO de texto (caracteres dentro de um bloco): vêm de <span style> inline, escritos pelo
// formatter do TinyMCE. '' / null = sem valor próprio (herda do bloco/livro). Escolhemos o formato por propriedade
// para que mudar uma não mexa nas outras.
import { parseLen, type Len } from './textProps';

export const UNDERLINE_STYLES = [['', 'Normal'], ['double', 'Duplo'], ['dotted', 'Ponteado'], ['dashed', 'Tracejado'], ['wavy', 'Ondulado']] as const;
export const TRANSFORMS = [['', 'Nenhuma'], ['lowercase', 'minúsculas'], ['capitalize', 'Cada Palavra']] as const;
export const WEIGHTS = [['', 'Padrão'], ['300', 'Leve'], ['400', 'Normal'], ['500', 'Médio'], ['600', 'Seminegrito'], ['800', 'Extranegrito'], ['900', 'Preto']] as const;
export const FONT_FAMILIES = [['', 'Padrão'], ['serif', 'Serifa'], ['sans-serif', 'Sem serifa'], ['monospace', 'Monoespaçada']] as const;

type Options = ReadonlyArray<readonly [string, string]>;
interface PropDef {
    css: string;                       // propriedade CSS
    format: string;                    // nome do formato do TinyMCE
    kind: 'color' | 'len' | 'enum';    // #rrggbb | Len | um dos `options`
    options?: Options;
    native?: true;                     // formato nativo do TinyMCE (não se regista em formats.ts)
    also?: readonly string[];          // declarações que a propriedade arrasta, no CSS do estilo e no formato
    formatAlso?: Record<string, string>; // só no formato do TinyMCE
}

// Box à volta do texto: a largura (ou a cor) liga o contorno; a caixa repete-se em cada linha quando o texto quebra.
const BORDER = ['border-style: solid', '-webkit-box-decoration-break: clone', 'box-decoration-break: clone'] as const;
const CLONE = ['-webkit-box-decoration-break: clone', 'box-decoration-break: clone'] as const;

/**
 * A ÚNICA tabela das propriedades de aspeto de uma seleção/estilo de caracteres. Daqui saem: o tipo, o valor vazio, a leitura do
 * que o editor tem, o CSS do estilo (e o inverso) e os formatos do TinyMCE (`charFormats`). Propriedade nova = uma linha aqui
 * (+ a linha do painel). Em texto corrido (inline) as margens verticais não têm efeito.
 */
const PROPS = {
    color: { css: 'color', format: 'forecolor', kind: 'color', native: true },
    background: { css: 'background-color', format: 'hilitecolor', kind: 'color', native: true },
    fontSize: { css: 'font-size', format: 'fontsize', kind: 'len', native: true },
    letterSpacing: { css: 'letter-spacing', format: 'letterspacing', kind: 'len' },
    fontFamily: { css: 'font-family', format: 'fontname', kind: 'enum', options: FONT_FAMILIES, native: true }, // família genérica: segura num EPUB
    borderColor: { css: 'border-color', format: 'bordercolor', kind: 'color' },
    borderWidth: { css: 'border-width', format: 'borderwidth', kind: 'len', also: BORDER },
    radius: { css: 'border-radius', format: 'borderradius', kind: 'len', also: CLONE },
    padTop: { css: 'padding-top', format: 'charpadtop', kind: 'len', also: CLONE },
    padRight: { css: 'padding-right', format: 'charpadright', kind: 'len', also: CLONE },
    padBottom: { css: 'padding-bottom', format: 'charpadbottom', kind: 'len', also: CLONE },
    padLeft: { css: 'padding-left', format: 'charpadleft', kind: 'len', also: CLONE },
    marginTop: { css: 'margin-top', format: 'charmargintop', kind: 'len' },
    marginRight: { css: 'margin-right', format: 'charmarginright', kind: 'len' },
    marginBottom: { css: 'margin-bottom', format: 'charmarginbottom', kind: 'len' },
    marginLeft: { css: 'margin-left', format: 'charmarginleft', kind: 'len' },
    underlineStyle: { css: 'text-decoration-style', format: 'underlinestyle', kind: 'enum', options: UNDERLINE_STYLES, formatAlso: { 'text-decoration-line': 'underline' } },
    underlineColor: { css: 'text-decoration-color', format: 'underlinecolor', kind: 'color' },
    underlineThickness: { css: 'text-decoration-thickness', format: 'underlinethickness', kind: 'len' },
    transform: { css: 'text-transform', format: 'texttransform', kind: 'enum', options: TRANSFORMS },
    weight: { css: 'font-weight', format: 'fontweight', kind: 'enum', options: WEIGHTS },
} as const satisfies Record<string, PropDef>;

/** '' / null = sem valor próprio (herda do bloco/livro). */
export type SelectionProps = { [K in keyof typeof PROPS]: (typeof PROPS)[K]['kind'] extends 'len' ? Len | null : string };

const KEYS = Object.keys(PROPS) as (keyof SelectionProps)[];
const def = (k: keyof SelectionProps): PropDef => PROPS[k];

export const EMPTY_SELECTION = Object.fromEntries(KEYS.map((k) => [k, def(k).kind === 'len' ? null : ''])) as SelectionProps;

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
    const also = new Set<string>();
    // A largura liga o contorno; a cor sozinha (sem largura) também (o painel põe 1px, mas um estilo antigo pode não ter).
    if (sel.borderColor) BORDER.forEach((d) => also.add(d));
    for (const k of KEYS) {
        const v = sel[k];
        if (v === '' || v === null) continue;
        decls.push(`${def(k).css}: ${typeof v === 'object' ? `${v.n}${v.u}` : v}`);
        def(k).also?.forEach((d) => also.add(d));
    }
    return [...decls, ...also].map((d) => `${d};`).join(' ');
}

// Valor de uma propriedade a partir de texto CSS; '' / null = não é um valor que o painel represente.
function parseProp(k: keyof SelectionProps, raw: string): string | Len | null {
    const d = def(k);
    const v = raw.trim().toLowerCase();
    if (d.kind === 'color') return toHex(raw);
    if (d.kind === 'len') return parseLen(v);
    return d.options?.some(([x]) => x && x === v) ? v : '';
}
const isValue = (v: string | Len | null): v is string | Len => v !== '' && v !== null;
const KEY_OF_CSS = Object.fromEntries(KEYS.map((k) => [def(k).css, k])) as Record<string, keyof SelectionProps>;

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
        const lenAll = (keys: (keyof SelectionProps)[]) => { // `padding: X` / `margin: X` (um só valor) vale para todos os lados; mais valores → rest
            const len = parseLen(v);
            if (len) keys.forEach((k) => Object.assign(sel, { [k]: len })); else keep();
        };
        if (name === 'font-weight' && (v === 'bold' || v === '700')) formats.add('bold');
        else if (name === 'font-style') { if (v === 'italic') formats.add('italic'); else keep(); }
        else if (name === 'text-decoration') {
            const tokens = v.split(/\s+/);
            if (tokens.every((t) => t === 'underline' || t === 'line-through')) tokens.forEach((t) => formats.add(t === 'underline' ? 'underline' : 'strikethrough'));
            else keep();
        } else if (name === 'vertical-align') { if (v === 'super') formats.add('superscript'); else if (v === 'sub') formats.add('subscript'); else keep(); }
        else if (name === 'font-variant') { if (v === 'small-caps') formats.add('small-caps'); else keep(); }
        else if (name === 'text-transform' && v === 'uppercase') formats.add('uppercase');
        else if (name === 'font-size' && v === 'smaller') smaller = true;
        else if (name === 'padding') lenAll(['padTop', 'padRight', 'padBottom', 'padLeft']);
        else if (name === 'margin') lenAll(['marginTop', 'marginRight', 'marginBottom', 'marginLeft']);
        else if (name === 'border-style' && v === 'solid') { /* implícito em borderColor/borderWidth */ }
        else if ((name === '-webkit-box-decoration-break' || name === 'box-decoration-break') && v === 'clone') { /* idem */ }
        else if (KEY_OF_CSS[name]) {
            const k = KEY_OF_CSS[name];
            const parsed = parseProp(k, value);
            if (isValue(parsed)) Object.assign(sel, { [k]: parsed }); else keep();
        } else keep();
    }
    // `font-size: smaller` acompanha sobrescrito/subscrito (ver FORMAT_CSS); sozinho é o "texto pequeno".
    if (smaller && !formats.has('superscript') && !formats.has('subscript')) formats.add('small-text');
    sel.formats = INLINE_FORMATS.map(([f]) => f as string).filter((f) => formats.has(f));
    return { selection: sel, rest };
}

/** "rgb(255, 224, 102)" | "#ffe066" → "#ffe066"; o resto (nomes, transparent) → ''. */
export function toHex(v: string): string {
    const hex = /^#([0-9a-f]{6})$/i.exec(v.trim());
    if (hex) return `#${hex[1].toLowerCase()}`;
    const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v.trim());
    return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '';
}

export function readSelectionProps(read: (cssName: string) => string): SelectionProps {
    const out = { ...EMPTY_SELECTION } as Record<string, string | Len | null>;
    for (const k of KEYS) out[k] = parseProp(k, read(def(k).css)) ?? (def(k).kind === 'len' ? null : '');
    return out as SelectionProps;
}

/** Patch → o que pedir ao formatter: formato, propriedade CSS (para saber o valor atual ao remover) e valor | null (remover). */
export function selectionPatchOps(patch: Partial<SelectionProps>): { format: string; css: string; value: string | null }[] {
    return KEYS.filter((k) => k in patch).map((k) => {
        const v = patch[k];
        const value = v === null || v === undefined || v === '' ? null : typeof v === 'object' ? `${v.n}${v.u}` : v;
        return { format: def(k).format, css: def(k).css, value };
    });
}

const camel = (css: string) => css.replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const declStyles = (d: string): [string, string] => { const [n, val] = d.split(': '); return [camel(n), val.replace(/;$/, '')]; };

/** Os formatos do TinyMCE que o editor tem de registar para as propriedades (formats.ts só os regista; o que cada um arrasta vem da tabela). */
export function charFormats(): { name: string; styles: Record<string, string> }[] {
    return KEYS.filter((k) => !def(k).native).map((k) => {
        const d = def(k);
        const styles: Record<string, string> = { [camel(d.css)]: '%value' };
        d.also?.forEach((x) => { const [n, val] = declStyles(x); styles[n] = val; });
        Object.entries(d.formatAlso ?? {}).forEach(([n, val]) => { styles[camel(n)] = val; });
        return { name: d.format, styles };
    });
}
