/**
 * "Onde estou no livro" → "que página do PDF abrir".
 * O editor tem marcadores de page-list (`span.pagebreak[data-page]`); o PDF tem páginas físicas
 * ligadas aos folios por `folioMap` (folio → índice físico). Os dois podem não coincidir
 * exatamente (folio sem âncora, capítulo sem marcadores), por isso escolhe-se o mais próximo.
 */

/** Folio do marcador em vigor em `refTop`: o último que já começou (top <= refTop); se a posição
 *  está antes do primeiro marcador, o primeiro (o mais próximo). `markers` em ordem do documento. */
export function pickFolio(markers: { page: number; top: number }[], refTop: number): number | null {
    if (markers.length === 0) return null;
    let current = markers[0].page;
    for (const m of markers) {
        if (m.top <= refTop) current = m.page;
        else break;
    }
    return current;
}

/** Página física do PDF para um folio: a exata, senão a do folio numericamente mais próximo
 *  (em empate, o anterior). `undefined` se não há mapa. */
export function nearestPdfPage(folioMap: Map<number, number>, folio: number): number | undefined {
    const exact = folioMap.get(folio);
    if (exact !== undefined) return exact;
    let best: number | undefined;
    let bestDist = Infinity;
    for (const [f, page] of folioMap) {
        const d = Math.abs(f - folio);
        if (d < bestDist || (d === bestDist && f < folio)) { best = page; bestDist = d; }
    }
    return best;
}
