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
