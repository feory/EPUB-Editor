// Os itens de texto de uma página do PDF agrupados em LINHAS: o único sítio onde se decide o que é "a mesma linha". Quem lê linhas (âncoras da
// lista de páginas, estilos, texto) pega nisto e só interpreta o que precisa.
import type { PdfPageText } from './pdf-pages';

export type PdfItem = PdfPageText['items'][number];
/** Uma linha: `y` do 1.º item e os itens da esquerda para a direita. */
export interface PdfRow { y: number; items: PdfItem[] }

/** pt: desvio vertical máximo de um sobrescrito face à linha do corpo (o nº de nota tem o y ligeiramente diferente e, agrupado por y exato, partia a linha). */
export const SUPER_Y_TOL = 5;

/** Linhas de uma página, topo→baixo. `dropBlank` deixa de fora os itens só com espaços (as auditorias de estilo não os querem; o texto corrido precisa deles). */
export function rowsOfPage(items: readonly PdfItem[], { dropBlank = false }: { dropBlank?: boolean } = {}): PdfRow[] {
    const sorted = items.filter((it) => it.str && (!dropBlank || it.str.trim())).sort((a, b) => b.transform[5] - a.transform[5]);
    const rows: PdfRow[] = [];
    for (const it of sorted) {
        const last = rows[rows.length - 1];
        if (last && last.y - it.transform[5] < SUPER_Y_TOL) last.items.push(it);
        else rows.push({ y: it.transform[5], items: [it] });
    }
    for (const r of rows) r.items.sort((a, b) => a.transform[4] - b.transform[4]);
    return rows;
}
