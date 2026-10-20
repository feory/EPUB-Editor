// Lógica pura de interpolação de folio — sem dependência de pdfjs-dist (page-list.ts importa-o
// a nível de módulo, o que exige globals de DOM indisponíveis em `bun test`; isolado aqui para
// ser testável sem esse peso).

// Aberturas de capítulo (e outras páginas de título) tipicamente OMITEM o folio impresso por
// convenção tipográfica, mas continuam a contar na numeração — sem isto ficavam sempre de fora
// da page-list. Interpola o folio em falta quando o salto entre duas páginas COM folio detetado
// bate certo com o nº de páginas físicas entre elas (sequência realmente contínua); um gap que
// não bate certo (ex. caderno de fotos sem numeração própria, ou front-matter em romano antes de
// a numeração começar) fica por preencher — mais seguro que assumir.
export function fillFolioGaps(folios: (number | null)[]): (number | null)[] {
    const filled = [...folios];

    // Início (antes do 1º folio detetado): só preenche se esse 1º folio bater certo com a
    // própria posição física contada desde a página 1 (ex. 1º folio "8" na 8ª página física —
    // mesma sequência arábica contínua do corpo, só não impressa nas páginas de abertura/
    // ficha técnica/rosto). Sem essa consistência (ex. corpo reinicia em "1" com romano por
    // detetar antes) fica por preencher — mais seguro que assumir onde começaria.
    const firstIdx = filled.findIndex(f => f !== null);
    if (firstIdx > 0 && filled[firstIdx]! - 1 === firstIdx) {
        for (let k = 0; k < firstIdx; k++) filled[k] = k + 1;
    }

    let last = -1;
    for (let i = 0; i < filled.length; i++) {
        if (filled[i] === null) continue;
        if (last >= 0) {
            const idxGap = i - last;
            const folioGap = filled[i]! - filled[last]!;
            if (idxGap > 1 && idxGap === folioGap) {
                for (let k = 1; k < idxGap; k++) filled[last + k] = filled[last]! + k;
            }
        }
        last = i;
    }
    return filled;
}

// Folios impressos que quebram a ordem do livro (ex. "47" lido numa página do Índice, a última
// entrada com dot-leader, antes do folio 6) ficam de fora: guarda-se a maior subsequência
// estritamente crescente. Só se aplica quando são poucos (≤ 5% e ≤ 5) — muitos "fora de ordem"
// significam numeração que recomeça (outro esquema), não ruído, e aí não se mexe.
export function dropFolioOutliers(folios: (number | null)[]): (number | null)[] {
    const at = folios.flatMap((f, i) => (f === null ? [] : [i]));
    const len: number[] = [];
    const prev: number[] = [];
    let end = -1;
    at.forEach((i, k) => {
        len[k] = 1; prev[k] = -1;
        for (let j = 0; j < k; j++) if (folios[at[j]]! < folios[i]! && len[j] + 1 > len[k]) { len[k] = len[j] + 1; prev[k] = j; }
        if (end < 0 || len[k] > len[end]) end = k;
    });
    const keep = new Set<number>();
    for (let k = end; k >= 0; k = prev[k]) keep.add(at[k]);
    const dropped = at.length - keep.size;
    if (dropped === 0 || dropped > 5 || dropped > at.length * 0.05) return folios;
    return folios.map((f, i) => (keep.has(i) ? f : null));
}
