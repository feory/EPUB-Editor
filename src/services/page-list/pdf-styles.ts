// A GEOMETRIA do PDF de impressão, para comparar com o estilo do livro (style-audit.ts): cada linha com a posição, o tamanho e o
// negrito/itálico, mais as medidas de cada página (margens, entrelinha) e o corpo de letra do livro. Puro (só lê `PdfPageText`).
import type { PdfImageBox, PdfPageText } from './pdf-pages';
import { normalize } from './pdf-text';

const SUPER_Y_TOL = 5;   // pt: igual a pdf-text.ts (um sobrescrito tem y ligeiramente diferente do corpo)
const KEY_LEN = 120;     // chars normalizados guardados por linha (chega para juntar linhas seguidas num parágrafo)
const MIN_LINES = 8;     // linhas de corpo para confiar nas margens de uma página
const MIN_GAPS = 5;
const MAX_LEADING = 40;  // pt: acima disto o salto vertical é quebra de coluna/secção, não entrelinha

/** `normalize` que também desfaz as ligaturas do PDF (ﬁ → fi): sem isso uma linha com "ﬁ" nunca casa com o texto do livro. */
export const fold = (s: string): string => normalize(s.normalize('NFKC'));

export interface StyledLine { key: string; x0: number; x1: number; y: number; size: number; bold: boolean; italic: boolean }
/** `left`/`right` = as margens do texto desta página; `gap` = a entrelinha normal. */
export interface StylePage { left: number; right: number; gap: number; lines: StyledLine[]; images?: PdfImageBox[] }
/** O que o PDF diz do estilo do livro: o corpo de letra e, por página, as linhas. É isto que vai dentro da operação fix_styles. */
export interface PdfStyles { body: number; pages: StylePage[] }

const round1 = (n: number) => Math.round(n * 10) / 10;
const median = (nums: number[]) => {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
function mode(nums: number[]): number | undefined {
    const count = new Map<number, number>();
    let best: number | undefined;
    for (const n of nums) {
        const c = (count.get(n) ?? 0) + 1;
        count.set(n, c);
        if (best === undefined || c > count.get(best)!) best = n;
    }
    return best;
}

/** A margem esquerda: o menor x0 que várias linhas partilham (≥ 3 e ≥ 10%). A moda enganava em páginas de diálogo, com muitos parágrafos de uma linha
 *  todos recuados: a moda era o recuo, não a margem. */
function leftMargin(xs: number[]): number | undefined {
    const count = new Map<number, number>();
    for (const x of xs) count.set(x, (count.get(x) ?? 0) + 1);
    const min = Math.max(3, xs.length * 0.1);
    return [...count.entries()].filter(([, c]) => c >= min).map(([x]) => x).sort((a, b) => a - b)[0];
}

/** As linhas de uma página, topo→baixo. Negrito/itálico = todas as partes COM letras (um nº de nota sobrescrito não conta). */
export function styledLines(page: PdfPageText): StyledLine[] {
    const items = page.items.filter((it) => it.str && it.str.trim()).sort((a, b) => b.transform[5] - a.transform[5]);
    const rows: { y: number; parts: PdfPageText['items'] }[] = [];
    for (const it of items) {
        const last = rows[rows.length - 1];
        if (last && last.y - it.transform[5] < SUPER_Y_TOL) last.parts.push(it);
        else rows.push({ y: it.transform[5], parts: [it] });
    }
    const out: StyledLine[] = [];
    for (const r of rows) {
        const parts = r.parts.sort((a, b) => a.transform[4] - b.transform[4]);
        const key = fold(parts.map((p) => p.str).join('')).slice(0, KEY_LEN);
        if (!key) continue;
        const sized = parts.reduce((a, b) => (b.str.length > a.str.length ? b : a));
        const lettered = parts.filter((p) => /\p{L}/u.test(p.str));
        const all = (flag: 'bold' | 'italic') => lettered.length > 0 && lettered.every((p) => p.font?.[flag]);
        out.push({
            key, y: Math.round(r.y * 10) / 10, size: round1(Math.abs(sized.transform[0])),
            x0: round1(parts[0].transform[4]),
            x1: round1(Math.max(...parts.map((p) => p.transform[4] + (p.width ?? p.str.length * Math.abs(p.transform[0]) * 0.5)))),
            bold: all('bold'), italic: all('italic'),
        });
    }
    return out;
}

/** As linhas de todas as páginas, com as margens e a entrelinha de cada uma e o corpo de letra do livro (o tamanho mais usado, por nº de caracteres). */
export function pdfStyles(pages: PdfPageText[]): PdfStyles {
    const lines = pages.map(styledLines);
    const chars = new Map<number, number>();
    for (const page of lines) for (const l of page) chars.set(l.size, (chars.get(l.size) ?? 0) + l.key.length);
    const body = [...chars.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    const isBody = (l: StyledLine) => Math.abs(l.size - body) <= 0.5;

    const gaps = (page: StyledLine[]) => page.slice(1).map((l, i) => page[i].y - l.y).filter((g) => g > 0 && g < MAX_LEADING);
    const globalLeft = leftMargin(lines.flat().filter(isBody).map((l) => Math.round(l.x0))) ?? 0;
    const globalRight = mode(lines.flat().filter(isBody).map((l) => Math.round(l.x1))) ?? 0;
    const globalGap = median(lines.flatMap(gaps));

    // Páginas com poucas linhas (aberturas, figuras) herdam as margens da página de mesma paridade anterior: o livro tem páginas pares/ímpares espelhadas.
    const out: StylePage[] = [];
    lines.forEach((page, i) => {
        const text = page.filter(isBody);
        const g = gaps(page);
        const left = text.length >= MIN_LINES ? leftMargin(text.map((l) => Math.round(l.x0))) : undefined;
        const right = text.length >= MIN_LINES ? mode(text.map((l) => Math.round(l.x1))) : undefined;
        out.push({
            left: left ?? out[i - 2]?.left ?? globalLeft,
            right: right ?? out[i - 2]?.right ?? globalRight,
            gap: g.length >= MIN_GAPS ? median(g) : globalGap,
            lines: page,
            images: pages[i].images?.length ? pages[i].images : undefined,
        });
    });
    return { body, pages: out };
}
