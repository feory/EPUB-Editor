// Aberturas de capítulo e divisórias de Parte do IDML que o corpo corrido não traz no sítio: cada uma é um bloco de HTML (heading + subtítulo)
// com uma chave de pesquisa (o texto que a página de abertura tem no PDF). Com o PDF, entra antes do 1.º bloco da página que se segue à
// abertura; sem PDF, ou sem âncora, vai para o fim em vez de se perder. Puro: recebe as páginas do PDF já lidas.
import { insertChapterHeadings } from '../../page-list/alignment';
import { chapterAnchorsFromPages } from '../../page-list/pdf-text';
import type { PdfPageText } from '../../page-list/pdf-pages';

export interface OpeningBlock { html: string; searchKey: string }

/** As páginas do PDF de impressão, lidas só quando se precisam (e uma só vez); undefined = sem PDF. */
type Pages = (() => Promise<PdfPageText[]>) | undefined;

/** Títulos de artigo/capítulo (coletâneas e livros sem CAPITULAR): ancorados pelo PDF; sem PDF ficam por inserir (o IDML não tem outra fronteira). */
export async function placeTitleBlocks(html: string, blocks: OpeningBlock[], pages: Pages): Promise<string> {
    if (!blocks.length || !pages) return html;
    const anchors = chapterAnchorsFromPages(await pages(), blocks.map(b => b.searchKey))
        .map(a => ({ anchor: a.anchor, headingHtml: blocks.find(b => b.searchKey === a.title)?.html }))
        .filter((a): a is { anchor: string; headingHtml: string } => !!a.headingHtml);
    return insertChapterHeadings(html, anchors).html;
}

const withAppended = (html: string, blocks: OpeningBlock[]): string => (blocks.length ? html + '\n' + blocks.map(b => b.html).join('\n') : html);

/** Divisórias "PARTE N": as que não encontrarem âncora (ou sem PDF) vão para o fim. Parte + 1.º capítulo abrem na mesma página (mesma âncora): um só ponto de inserção, na ordem do livro. */
export async function placePartBlocks(html: string, blocks: OpeningBlock[], pages: Pages): Promise<string> {
    if (!blocks.length || !pages) return withAppended(html, blocks);
    const groups: { anchor: string; members: number[] }[] = [];
    for (const a of chapterAnchorsFromPages(await pages(), blocks.map(b => b.searchKey))) {
        const i = blocks.findIndex(b => b.searchKey === a.title);
        if (i < 0) continue;
        (groups.find(g => g.anchor === a.anchor) ?? groups[groups.push({ anchor: a.anchor, members: [] }) - 1]).members.push(i);
    }
    const res = insertChapterHeadings(html, groups.map(g => ({ anchor: g.anchor, headingHtml: g.members.map(i => blocks[i].html).join('\n') })));
    const placed = new Set(res.placed.flatMap(gi => groups[gi].members));
    return withAppended(res.html, blocks.filter((_, i) => !placed.has(i)));
}
