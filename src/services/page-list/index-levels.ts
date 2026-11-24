// Prepara o capítulo Índice Remissivo: (1) liga cada nº de página ao marcador dessa página (span.idx-link → page-N) e (2) marca o nível de cada
// entrada segundo o PDF de impressão: principal (à margem da coluna) ou subentrada (recuada). O texto extraído do PDF perde o recuo; aqui lê-se
// de volta pela posição horizontal (x0) da 1.ª linha de cada entrada e marca-se com p-indice / p-indice-sub.
import type { PdfPageText } from './pdf-pages';
import { INDEX_PAGE_LIST, wrapPageLinks } from '../../utils/index-cleaner';
import { fold } from './pdf-styles';
import { rowsOfPage } from './pdf-rows';
import { suspectsInBlocks, type TextSuspect } from './pdf-text-suspects';

export const INDEX_MAIN = 'p-indice';
export const INDEX_SUB = 'p-indice-sub';

const INDEX_CHAPTER = /^[ií]ndice remissivo/i;
const CELL_GAP = 1.2;   // × corpo de letra: entre duas partes da mesma linha, um salto maior que isto separa colunas (as colunas do Índice distam ~1,5×)
const COLUMN_GAP = 30;  // pt: entre colunas o x0 salta mais do que isto; dentro da coluna os recuos são de poucos pt
const SUB_INDENT = 4;   // pt: a partir daqui (face à margem da coluna) a linha é subentrada
const LOOKAHEAD = 40;   // células à frente onde uma entrada pode começar (cabeçalhos e folios de página ficam pelo caminho)

export interface IndexResult {
    html: string;
    /** Entradas com algum nº de página ligado agora. */
    linked: number;
    /** Trechos suspeitos de erro do PDF neste capítulo (hífen partido, palavras coladas): ficam como estão, para rever à mão. */
    suspects: TextSuspect[];
    /** Travessões duplos ("– –") reduzidos a um. */
    dashes: number;
    main: number;
    sub: number;
    /** Entradas que o PDF não confirmou (ficam sem nível). Sem PDF: todas. */
    unmatched: number;
    /** Existe o capítulo Índice Remissivo? */
    found: boolean;
    /** Havia PDF e o título do capítulo está nele (só então se marcam os níveis)? */
    levels: boolean;
}

/** Uma linha de uma coluna do PDF: o texto (normalizado) e onde começa. */
interface Cell { key: string; x0: number; page: number }

/** As células do PDF por ordem de leitura (página a página, coluna da esquerda e depois a da direita, de cima para baixo). */
function cellsOf(pages: PdfPageText[]): Cell[] {
    const out: Cell[] = [];
    pages.forEach((p, page) => {
        const cells: Cell[] = [];
        for (const row of rowsOfPage(p.items, { dropBlank: true })) {
            let cur: PdfPageText['items'] = [], end = NaN;
            const flush = () => { if (cur.length) cells.push({ key: fold(cur.map((i) => i.str).join('')), x0: cur[0].transform[4], page }); cur = []; };
            for (const it of row.items) {
                if (cur.length && it.transform[4] - end > CELL_GAP * (Math.abs(it.transform[0]) || 10)) flush();
                cur.push(it);
                end = it.transform[4] + (it.width ?? 0);
            }
            flush();
        }
        const bases = columnBases(cells.map((c) => c.x0));
        const column = (c: Cell) => bases.reduce((n, b, i) => (b <= c.x0 + 1 ? i : n), 0);
        out.push(...cells.map((c, i) => ({ c, i })).sort((a, b) => column(a.c) - column(b.c) || a.i - b.i).map(({ c }) => c));
    });
    return out;
}

/** Margem de cada coluna: os x0 agrupados onde o salto passa COLUMN_GAP; a margem é o menor de cada grupo. */
function columnBases(xs: number[]): number[] {
    const sorted = [...new Set(xs.map((x) => Math.round(x * 2) / 2))].sort((a, b) => a - b);
    const bases: number[] = [];
    sorted.forEach((x, i) => { if (i === 0 || x - sorted[i - 1] > COLUMN_GAP) bases.push(x); });
    return bases;
}

/** Embrulha, em cada nº de uma lista de páginas (", 34, 56–58"), um span.idx-link para o marcador dessa página, sem mexer na formatação à volta
 *  (<em>, notas…). Só toca em texto fora de ligações já feitas, por isso correr outra vez não muda nada. */
function linkPageNumbers(el: Element): boolean {
    const doc = el.ownerDocument;
    const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT: sem o global NodeFilter nos testes */);
    const texts: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
    let changed = false;
    for (const t of texts) {
        const raw = t.textContent ?? '';
        const linked = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(INDEX_PAGE_LIST, (m) => wrapPageLinks(m));
        if (!linked.includes('idx-link')) continue;
        const tpl = doc.createElement('template');
        tpl.innerHTML = linked;
        t.replaceWith(...Array.from(tpl.content.childNodes));
        changed = true;
    }
    return changed;
}

/** Intervalo de páginas partido pelo PDF ("44– –49"): um só travessão. Devolve quantos juntou. */
function fixDoubleDashes(el: Element): number {
    const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    let fixed = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const raw = n.textContent ?? '';
        const text = raw.replace(/([–—])\s+\1/g, () => { fixed++; return '$1'; });
        if (text !== raw) n.textContent = raw.replace(/([–—])\s+\1/g, '$1');
    }
    return fixed;
}

function suspectsOf(entries: Element[]): TextSuspect[] {
    return suspectsInBlocks(entries.map((el) => el.textContent ?? ''), 'Índice Remissivo', true);
}

/** Os `<p>` do capítulo Índice Remissivo que são entradas (com texto). */
function indexEntriesOf(doc: Document): Element[] {
    const entries: Element[] = [];
    let inIndex = false;
    for (const el of Array.from(doc.body.children)) {
        if (el.tagName === 'P' && /(^| )chapter-break/.test(el.className)) { inIndex = INDEX_CHAPTER.test((el.getAttribute('data-title') ?? '').trim()); continue; }
        if (inIndex && el.tagName === 'P' && fold(el.textContent ?? '').length >= 3) entries.push(el);
    }
    return entries;
}

/** O recuo inline que o antigo "Recuar Subentradas" deixava: já não faz falta (agora é a classe) e somava-se a ela. */
const LEGACY_SUB_PADDING = /(^|;)\s*padding-left\s*:\s*40px\s*;?/i;

export function reviewIndex(html: string, pages: PdfPageText[] | null): IndexResult {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const entries = indexEntriesOf(doc);
    const none = { html, linked: 0, dashes: 0, suspects: [], main: 0, sub: 0, unmatched: entries.length };
    if (!entries.length) return { ...none, found: false, levels: false };

    const dashes = entries.reduce((n, el) => n + fixDoubleDashes(el), 0); // antes de ligar: "44– –49" tem de ser um intervalo
    const linked = entries.filter(linkPageNumbers).length;
    const suspects = suspectsOf(entries);
    const finish = (main: number, sub: number, unmatched: number, levels: boolean): IndexResult => ({
        html: dashes + linked + main + sub ? doc.body.innerHTML : html, linked, dashes, suspects, main, sub, unmatched, found: true, levels,
    });

    const cells = pages ? cellsOf(pages) : [];
    if (!pages) return finish(0, 0, entries.length, false);
    // O título impresso do capítulo: a linha é só ele, e a seguir vem a 1.ª entrada (no Índice geral há outra linha igual, com a 1.ª entrada longe).
    const title = fold('Índice remissivo'), first = fold(entries[0].textContent ?? '');
    const startsAt = (i: number) => cells.slice(i + 1, i + 1 + LOOKAHEAD).some((c) => c.key && first.startsWith(c.key));
    const start = cells.findIndex((c, i) => c.key === title && startsAt(i));
    if (start < 0) return finish(0, 0, entries.length, false);

    // 1.ª passagem: a célula onde cada entrada começa (e as de continuação, para as margens da página).
    let cursor = start + 1;
    const matched: { el: Element; first: Cell }[] = [];
    const xsByPage = new Map<number, number[]>();
    for (const el of entries) {
        const text = fold(el.textContent ?? '');
        let j = cursor;
        while (j < cells.length && j < cursor + LOOKAHEAD && !(cells[j].key && text.startsWith(cells[j].key))) j++;
        if (j >= cells.length || j >= cursor + LOOKAHEAD) continue;
        let acc = cells[j].key, end = j;
        while (acc.length < text.length && end + 1 < cells.length) {
            const next = cells[end + 1].key, rest = text.slice(acc.length);
            if (!next || !(rest.startsWith(next) || next.startsWith(rest))) break;
            acc += next;
            end++;
        }
        cursor = end + 1;
        matched.push({ el, first: cells[j] });
        const xs = xsByPage.get(cells[j].page) ?? [];
        for (let k = j; k <= end; k++) xs.push(cells[k].x0);
        xsByPage.set(cells[j].page, xs);
    }

    // 2.ª: nível = recuo da 1.ª linha face à margem da sua coluna.
    let main = 0, sub = 0;
    for (const { el, first } of matched) {
        const base = columnBases(xsByPage.get(first.page)!).reverse().find((b) => b <= first.x0 + 1) ?? first.x0;
        const isSub = first.x0 - base >= SUB_INDENT;
        el.classList.remove(isSub ? INDEX_MAIN : INDEX_SUB);
        el.classList.add(isSub ? INDEX_SUB : INDEX_MAIN);
        const style = el.getAttribute('style');
        if (style && LEGACY_SUB_PADDING.test(style)) {
            const rest = style.replace(LEGACY_SUB_PADDING, '$1').replace(/^[\s;]+|[\s;]+$/g, '');
            if (rest) el.setAttribute('style', rest); else el.removeAttribute('style');
        }
        if (isSub) sub++; else main++;
    }
    return finish(main, sub, entries.length - matched.length, true);
}
