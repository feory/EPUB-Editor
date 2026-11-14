/** Markdown mínimo dos guias (docs em `content/`): títulos, listas, tabelas, citações, **negrito**, *itálico*, `código`, [ligações]. Sem HTML, por isso não há nada para sanear. */

export type Inline =
    | { t: 'text'; v: string }
    | { t: 'b' | 'i'; c: Inline[] }
    | { t: 'code'; v: string }
    | { t: 'link'; href: string; c: Inline[] };

export type Block =
    | { t: 'p'; c: Inline[] }
    | { t: 'h3'; text: string }
    | { t: 'ul' | 'ol'; items: Inline[][] }
    | { t: 'quote'; c: Inline[] }
    | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

/** Um `## título` e o que vem a seguir. `{admin}` no fim do título marca secções só para administradores. */
export interface Section { id: string; title: string; admin: boolean; blocks: Block[] }
export interface Doc { title: string; lead: Block[]; sections: Section[] }

// Ordem das alternativas = prioridade: ** antes de *; o itálico não abre nem fecha junto a espaço (assim "(*)" fica literal).
const TOKEN = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*(?!\s)([^*]+?)(?<!\s)\*/g;

export function parseInline(src: string): Inline[] {
    const out: Inline[] = [];
    let last = 0;
    for (const m of src.matchAll(TOKEN)) {
        if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
        if (m[1] !== undefined) out.push({ t: 'b', c: parseInline(m[1]) });
        else if (m[2] !== undefined) out.push({ t: 'code', v: m[2] });
        else if (m[3] !== undefined) out.push({ t: 'link', href: m[4], c: parseInline(m[3]) });
        else out.push({ t: 'i', c: parseInline(m[5]) });
        last = m.index + m[0].length;
    }
    if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
    return out;
}

export const slug = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Minúsculas e sem acentos: a pesquisa não distingue "Índice" de "indice". */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => parseInline(c.trim()));

export function parseDoc(md: string, docId: string): Doc {
    const doc: Doc = { title: '', lead: [], sections: [] };
    const lines = md.split('\n');
    const push = (b: Block) => (doc.sections.at(-1)?.blocks ?? doc.lead).push(b);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || /^-{3,}$/.test(line.trim())) continue;
        if (line.startsWith('# ')) { doc.title = line.slice(2).trim(); continue; }
        if (line.startsWith('## ')) {
            const raw = line.slice(3).trim();
            const admin = raw.endsWith('{admin}');
            const title = raw.replace(/\s*\{admin\}$/, '');
            doc.sections.push({ id: `${docId}-${slug(title)}`, title, admin, blocks: [] });
            continue;
        }
        if (line.startsWith('### ')) { push({ t: 'h3', text: line.slice(4).trim() }); continue; }
        if (line.startsWith('>')) {
            const text: string[] = [];
            for (; i < lines.length && lines[i].startsWith('>'); i++) text.push(lines[i].replace(/^>\s?/, ''));
            i--;
            push({ t: 'quote', c: parseInline(text.join(' ')) });
            continue;
        }
        if (line.startsWith('|')) {
            const rows: string[] = [];
            for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(lines[i]);
            i--;
            push({ t: 'table', head: cells(rows[0]), rows: rows.slice(2).map(cells) });
            continue;
        }
        const bullet = /^- /.test(line), numbered = /^\d+\. /.test(line);
        if (bullet || numbered) {
            const marker = bullet ? /^- / : /^\d+\. /;
            const items: Inline[][] = [];
            for (; i < lines.length && marker.test(lines[i]); i++) items.push(parseInline(lines[i].replace(marker, '')));
            i--;
            push({ t: bullet ? 'ul' : 'ol', items });
            continue;
        }
        const text = [line.trim()];
        while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|>|\||- |\d+\. |-{3,}$)/.test(lines[i + 1])) text.push(lines[++i].trim());
        push({ t: 'p', c: parseInline(text.join(' ')) });
    }
    return doc;
}

const inlineText = (c: Inline[]): string => c.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : inlineText(x.c))).join('');

/** Todo o texto de uma secção (para a pesquisa). */
export function sectionText(s: Section): string {
    const parts = [s.title];
    for (const b of s.blocks) {
        if (b.t === 'h3') parts.push(b.text);
        else if (b.t === 'p' || b.t === 'quote') parts.push(inlineText(b.c));
        else if (b.t === 'table') { b.head.forEach((c) => parts.push(inlineText(c))); b.rows.forEach((r) => r.forEach((c) => parts.push(inlineText(c)))); }
        else b.items.forEach((it) => parts.push(inlineText(it)));
    }
    return parts.join(' ');
}
