/**
 * Ler as notas de um HTML: UMA só regra para "o que é uma nota". Quem precisa de saber (o validador, a lista de páginas…) lê daqui em vez
 * de ter a sua regex. Uma NOTA é um parágrafo que:
 *   - tem a classe `footnote` (rodapé, `(<sup>1</sup>) texto` ou `<sup>*</sup>`), kind 'footnote'; ou
 *   - abre com o marcador em <sup> (`<p><sup>6</sup> texto</p>`: as notas do fim do capítulo, sem classe), kind 'endnote'.
 * O marcador é um número ou asteriscos. Marcadores de página (`span.pagebreak`) à cabeça ou dentro do <sup> não contam: não escondem o marcador.
 * Uma REFERÊNCIA é qualquer outro <sup>marcador</sup>. A importação e o export (linkFootnotes) continuam a ter o seu código: este módulo só lê.
 */
export type NoteKind = 'footnote' | 'endnote';
export interface NoteDef { marker: string; kind: NoteKind; /** Texto da nota, sem o marcador. */ text: string }
export interface NoteRef { marker: string; /** O texto à volta, para o localizar. */ context: string }
export interface Notes { defs: NoteDef[]; refs: NoteRef[] }

const PAGEBREAK = /<span class="pagebreak"[^>]*><\/span>/g;
const HAS_FOOTNOTE_CLASS = /(^|\s)footnote(\s|$)/;
/** O que abre uma nota: [espaços] [<a>] [parêntese] <sup>marcador</sup> [parêntese]. */
const LEAD = /^(?:\s|&nbsp;)*(?:<a\b[^>]*>)?\s*\(?\s*<sup[^>]*>\s*(\d+|\*+)\s*<\/sup>\s*\)?(?:<\/a>)?/;
const SUP = /<sup[^>]*>\s*(\d+|\*+)\s*<\/sup>/g;
const PARAGRAPH = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;

const plain = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Como abre este parágrafo (innerHTML + classes): marcador e tipo de nota, ou null se não é nota. Marcador '?' = tem a classe footnote mas não traz número. */
export function noteLead(inner: string, className: string): { marker: string; kind: NoteKind; rest: string } | null {
    const clean = inner.replace(PAGEBREAK, '');
    const lead = LEAD.exec(clean);
    const footnote = HAS_FOOTNOTE_CLASS.test(className);
    if (lead) return { marker: lead[1], kind: footnote ? 'footnote' : 'endnote', rest: clean.slice(lead[0].length) };
    return footnote ? { marker: '?', kind: 'footnote', rest: clean } : null;
}

const noteElements = new WeakMap<Element, boolean>();
/** O mesmo teste sobre um elemento do DOM (o alinhamento da lista de páginas anda no DOM); guardado por elemento, porque o innerHTML custa. */
export function isNoteElement(el: Element | null): boolean {
    if (!el) return false;
    let is = noteElements.get(el);
    if (is === undefined) noteElements.set(el, is = noteLead(el.innerHTML, el.className) !== null);
    return is;
}

/** `<sup>` que é expoente e não referência de nota: "10<sup>12</sup>" (potência de dez), "m<sup>2</sup>", "km<sup>3</sup>", "ha<sup>2</sup>". `before` = o texto (ou HTML, com algumas etiquetas de permeio) que o antecede. */
export function isExponent(before: string, marker: string): boolean {
    const text = before.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
    if (/(?:^|[^\p{L}\d.,])10$/u.test(text)) return true;
    return /^[23]$/.test(marker) && /(?:^|[^\p{L}])(?:[kcdm]?m|ha)$/u.test(text);
}

export function readNotes(html: string): Notes {
    const clean = html.replace(PAGEBREAK, '');
    const defs: NoteDef[] = [];
    const refs: NoteRef[] = [];
    const leadSups: number[] = []; // posições (em `clean`) do <sup> que abre cada nota: não são referências
    for (const m of clean.matchAll(PARAGRAPH)) {
        const lead = noteLead(m[2], m[1].match(/class="([^"]*)"/)?.[1] ?? '');
        if (!lead) continue;
        defs.push({ marker: lead.marker, kind: lead.kind, text: plain(lead.rest) });
        const sup = lead.marker === '?' ? -1 : m[2].search(/<sup/);
        if (sup >= 0) leadSups.push(m.index + m[0].indexOf(m[2]) + sup);
    }
    const skip = new Set(leadSups);
    for (const m of clean.matchAll(SUP)) {
        if (skip.has(m.index) || isExponent(clean.slice(Math.max(0, m.index - 120), m.index), m[1])) continue;
        refs.push({ marker: m[1], context: plain(clean.slice(Math.max(0, m.index - 60), m.index)).slice(-30) });
    }
    return { defs, refs };
}
