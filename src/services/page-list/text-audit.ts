// Paridade de TEXTO entre o PDF de impressão e o livro: o que o PDF tem e o livro não (texto perdido ou alterado na importação) e o que
// o livro tem e o PDF não (texto a mais ou duplicado). Compara por texto normalizado e contíguo (sem espaços, pontuação nem hífens), por isso a
// hifenização e a quebra de linha do PDF não contam como diferença. Só lê; não altera nada.
import type { PdfPageText } from './pdf-pages';
import { detectFolios } from './pdf-text';
import { fold } from './pdf-styles';
import { SKIP_CHAPTER } from './style-audit';

const SUPER_Y_TOL = 5;    // pt: um sobrescrito tem y ligeiramente diferente do corpo (igual a pdf-text.ts)
const MIN_LINE = 20;      // chars normalizados: abaixo disto uma linha (título curto, nº, "Fim") casa em qualquer lado
const WINDOW = 30;        // um bloco do livro verifica-se em janelas deste tamanho
const COLUMN_GAP = 1.5;     // em corpos de letra: um espaço maior que isto entre duas palavras da mesma linha separa colunas (tabelas, diagramas, índice remissivo)
const HEADER_PAGES = 3;   // uma linha que se repete em tantas páginas é cabeçalho/rodapé corrente, não texto
const FIRST_BODY_LINES = 3; // linhas de uma página que têm de estar no livro para ela contar como o início do corpo
const COLUMN_ROWS = 4;      // linhas partidas em colunas (e a fração mínima delas) a partir das quais a página é de colunas/tabela
const COLUMN_SHARE = 0.25;
const WORD_SHARE = 0.9;     // fração das palavras de um bloco que tem de existir nas páginas de colunas para ele lá ser dado como presente
const FIGURE_REACH = 200;   // chars do texto do livro à volta do alcance de uma página em que uma imagem ainda conta como "na página"
const CAPTION = /^(figura|quadro|tabela|gr[aá]fico|mapa|infogr[aá]fico)\s*[\w.]+/i; // uma legenda é texto de verdade: nunca se dá por texto de figura
const MAX_FOUND = 200;
const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,dt,dd';

export interface TextAudit {
    /** Linhas do PDF comparadas (as de páginas do Índice e os cabeçalhos correntes ficam de fora) e blocos do livro comparados. */
    pdfLines: number; bookBlocks: number;
    /** No PDF, não no livro. `page` = posição física no PDF (1-based). */
    missing: { page: number; text: string }[];
    /** No livro, não no PDF. */
    extra: { chapter: string; text: string }[];
    /** Páginas do PDF (1-based) com layout em colunas ou tabela: o PDF lê-as linha a linha, a atravessar as colunas, por isso não se comparam; confirmam-se à mão. */
    columnPages: number[];
    /** Blocos do livro cujas palavras estão nessas páginas (não contam como "a mais"). */
    columnBlocks: number;
    /** Linhas do PDF sem correspondência em páginas onde o livro tem uma imagem: provavelmente o texto de um diagrama que o livro tem como imagem. */
    figureText: { page: number; text: string }[];
}

/** As linhas de uma página, topo→baixo, partidas onde há um espaço de coluna: células e colunas lado a lado não se colam numa só linha. */
function rowsOf(items: PdfPageText['items']): string[][] {
    const sorted = items.filter((it) => it.str).sort((a, b) => b.transform[5] - a.transform[5]);
    const rows: { y: number; parts: typeof items }[] = [];
    for (const it of sorted) {
        const last = rows[rows.length - 1];
        if (last && last.y - it.transform[5] < SUPER_Y_TOL) last.parts.push(it); else rows.push({ y: it.transform[5], parts: [it] });
    }
    return rows.map((r) => {
        const out: string[] = [];
        let cur = '', end = NaN;
        for (const it of r.parts.sort((a, b) => a.transform[4] - b.transform[4])) {
            const size = Math.abs(it.transform[0]) || 1;
            if (cur && it.width !== undefined && it.transform[4] - end > COLUMN_GAP * size) { out.push(cur); cur = ''; }
            cur += it.str;
            end = it.transform[4] + (it.width ?? 0);
        }
        return cur ? [...out, cur] : out;
    }).filter((r) => r.length);
}

/** O texto do livro por bloco de folha (sem o Índice, a ficha técnica e afins: SKIP_CHAPTER), com o capítulo. */
function bookBlocks(html: string): { blocks: { chapter: string; text: string; norm: string }[]; /** Posição (no texto corrido dos blocos) de cada imagem do livro. */ imgAt: number[] } {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out: { chapter: string; text: string; norm: string }[] = [];
    const imgAt: number[] = [];
    let chapter = '', skip = false, len = 0;
    for (const el of Array.from(doc.body.querySelectorAll(`${BLOCKS},p.chapter-break,img`))) {
        if (el.tagName === 'P' && /(^| )chapter-break/.test(el.className)) {
            chapter = el.getAttribute('data-title') ?? chapter;
            skip = SKIP_CHAPTER.test(chapter.trim());
            continue;
        }
        if (el.tagName === 'IMG') { if (!skip) imgAt.push(len); continue; }
        if (skip || el.querySelector(BLOCKS)) continue; // blocos folha: um <li> com <p> conta pelo <p>
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
        const norm = fold(text);
        if (norm.length >= MIN_LINE) { out.push({ chapter, text, norm }); len += norm.length; }
    }
    return { blocks: out, imgAt };
}

export function auditText(pages: PdfPageText[], html: string): TextAudit {
    const { printed } = detectFolios(pages);
    const { blocks, imgAt } = bookBlocks(html);
    const bookFlat = blocks.map((b) => b.norm).join('');

    const rows = pages.map((page, i) => (printed[i] !== null ? rowsOf(page.items).slice(1) : rowsOf(page.items))); // 1.ª linha = cabeçalho corrente
    const isColumns = rows.map((r) => { const split = r.filter((x) => x.length > 1).length; return split >= COLUMN_ROWS && split >= r.length * COLUMN_SHARE; });
    const lines = rows.map((r) => r.flat().map((t) => ({ text: t.trim(), norm: fold(t) })).filter((l) => l.norm && !l.norm.includes('indd')));
    const seen = new Map<string, Set<number>>();
    lines.forEach((p, i) => p.forEach((l) => (seen.get(l.norm) ?? seen.set(l.norm, new Set()).get(l.norm)!).add(i)));
    // repetidas em várias páginas = cabeçalho corrente (só as longas: "12" ou "Fim" repetem-se por acaso)
    const kept = lines.map((p) => p.filter((l) => l.norm.length < MIN_LINE || seen.get(l.norm)!.size < HEADER_PAGES));

    // O texto do PDF todo conta para saber o que o livro tem a mais; mas só se procura no livro o que vem depois da 1.ª página com texto dele:
    // a ficha técnica e o Índice do impresso (antes do corpo) não existem iguais no livro.
    // Uma capitular é uma letra grande à parte que o PDF cola à linha vizinha: a linha também casa sem a 1.ª letra.
    const found = (norm: string) => bookFlat.includes(norm) || bookFlat.includes(norm.slice(1));
    const inBook = (p: { norm: string }[]) => p.filter((l) => l.norm.length >= MIN_LINE && found(l.norm)).length;
    const first = kept.findIndex((p) => inBook(p) >= FIRST_BODY_LINES);
    const audit: TextAudit = { pdfLines: 0, bookBlocks: blocks.length, missing: [], extra: [], columnPages: [], columnBlocks: 0, figureText: [] };
    const columnWords = new Set(kept.filter((_, i) => isColumns[i]).flat().flatMap((l) => l.text.split(/\s+/).map(fold)));
    const pdfFlat = kept.flat().map((l) => l.norm).join('');
    kept.forEach((p, i) => {
        if (first < 0 || i < first) return;
        if (isColumns[i]) { audit.columnPages.push(i + 1); return; }
        // Onde esta página cai no livro (pelas suas linhas que lá existem): se aí há uma imagem, o que não se encontra é provavelmente o texto dela.
        const at = p.filter((l) => l.norm.length >= MIN_LINE).map((l) => bookFlat.indexOf(l.norm)).filter((n) => n >= 0);
        const hasImage = at.length > 0 && imgAt.some((o) => o >= Math.min(...at) - FIGURE_REACH && o <= Math.max(...at) + FIGURE_REACH);
        for (const l of p) {
            if (l.norm.length < MIN_LINE) continue;
            audit.pdfLines++;
            if (found(l.norm)) continue;
            const list = hasImage && !CAPTION.test(l.text) ? audit.figureText : audit.missing;
            if (list.length < MAX_FOUND) list.push({ page: i + 1, text: l.text });
        }
    });
    for (const b of blocks) {
        const starts = Array.from({ length: Math.ceil(b.norm.length / WINDOW) }, (_, k) => Math.min(k * WINDOW, Math.max(0, b.norm.length - WINDOW)));
        const absent = starts.filter((s) => !pdfFlat.includes(b.norm.slice(s, s + WINDOW))).length;
        if (absent * 2 <= starts.length) continue;
        const words = b.text.split(/\s+/).map(fold).filter(Boolean);
        if (columnWords.size && words.filter((w) => columnWords.has(w)).length >= words.length * WORD_SHARE) audit.columnBlocks++;
        else if (audit.extra.length < MAX_FOUND) audit.extra.push({ chapter: b.chapter, text: b.text });
    }
    return audit;
}
