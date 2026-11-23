// Saltar no editor para algo que está num capítulo: o editor só mostra UM capítulo de cada vez (ou o livro todo), por isso um salto é
// sempre "descobrir que capítulo é o dono" + "trocar para ele, se for outro, e só depois saltar". Aqui vive a parte sem React nem editor:
// de que capítulo é o destino e o protocolo da troca, com as portas (editor, capítulo ativo) injetadas.

/** O capítulo (índice) cujo HTML contém `needle` (um marcador `data-*`, por exemplo); -1 se nenhum. */
export const chapterOwning = (parts: string[], needle: string): number => parts.findIndex((p) => p.includes(needle));

/**
 * O parágrafo N do livro inteiro (índice de `extractParagraphs` sobre o livro todo) como (capítulo, índice local); null se N não existe.
 * `countIn` conta os parágrafos de um capítulo (a mesma seleção do diff de versões, para os índices baterem).
 */
export function locateParagraph(parts: string[], globalIndex: number, countIn: (part: string) => number): { chapter: number; local: number } | null {
    let rest = globalIndex;
    for (let chapter = 0; chapter < parts.length; chapter++) {
        const count = countIn(parts[chapter]);
        if (rest < count) return { chapter, local: rest };
        rest -= count;
    }
    return null;
}

/** O que o protocolo precisa do editor e do estado dos capítulos. `active` = capítulo aberto (-1 = o livro todo). */
export interface ChapterPorts {
    active: number;
    /** Corre `then` quando o editor acaba de trocar de capítulo. */
    afterChapterChange(then: () => void): void;
    setActive(chapter: number): void;
}

/**
 * Corre `scroll` com o capítulo `chapter` aberto: já, se o editor mostra o livro todo ou esse capítulo; senão regista o salto para
 * quando a troca acabar (ANTES de a pedir, para não o perder) e troca.
 */
export function scrollInChapter(ports: ChapterPorts, chapter: number, scroll: () => void): void {
    if (ports.active === -1 || chapter === ports.active) { scroll(); return; }
    ports.afterChapterChange(scroll);
    ports.setActive(chapter);
}
