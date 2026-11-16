import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
(globalThis as { NodeFilter?: unknown }).NodeFilter ??= { SHOW_TEXT: 4 };
const { anchorsFromPages, normalize } = await import('./page-list');

type Item = { str: string; transform: number[] };
const it = (str: string, x: number, y: number): Item => ({ str, transform: [1, 0, 0, 1, x, y] });
const H = 800;
// Página com cabeçalho corrente + folio no TOPO (y > 88%) e duas linhas de corpo.
const page = (folio: number, body: string[]): { vpH: number; items: Item[] } => ({
    vpH: H,
    items: [it(String(folio), 50, 750), it('TITULO CORRENTE DO LIVRO', 80, 750), ...body.map((t, i) => it(t, 50, 600 - i * 20))],
});

test('anchorsFromPages: âncora = 1.ª linha de corpo depois do cabeçalho corrente; folio no topo', () => {
    const pages = [1, 2, 3].map(n => page(n, [`Primeira linha da pagina ${n} com texto suficiente`, 'segunda linha']));
    const anchors = anchorsFromPages(pages);
    expect(anchors.map(a => a.page)).toEqual([1, 2, 3]);
    expect(anchors[1]).toMatchObject({ pdfPageIndex: 2, anchor: normalize('Primeira linha da pagina 2 com texto suficiente').slice(0, 30) });
});

test('anchorsFromPages: nº de nota sobrescrito (y ligeiramente diferente) fica na MESMA linha da âncora', () => {
    const body = [it('em sentido extramoral.»', 50, 600), it('9', 200, 603), it(' Até mesmo o meu discurso', 210, 600)];
    const pages = [1, 2].map(n => ({ vpH: H, items: [it(String(n), 50, 750), it('CABECALHO', 80, 750), ...(n === 2 ? body : [it('texto da primeira pagina do livro aqui', 50, 600)])] }));
    const a = anchorsFromPages(pages).find(x => x.page === 2)!;
    expect(a.anchor).toBe(normalize('em sentido extramoral.»9 Até mesmo o meu discurso').slice(0, 30));
});

test('anchorsFromPages: sem folio nem interpolável (front-matter) não gera âncora', () => {
    const noFolio = { vpH: H, items: [it('Folha de rosto sem numeracao nenhuma aqui', 50, 600)] };
    expect(anchorsFromPages([noFolio])).toEqual([]);
});

const { auditPageList } = await import('./page-list');

test('auditPageList: marcada, em branco, figura, abre com figura e fora de ordem', () => {
    const pages = [
        page(1, ['Texto da pagina um que esta no livro com marcador']),
        page(2, []),                                              // só cabeçalho + folio, e a marca do InDesign
        page(3, ['ROTULO DE FIGURA QUE SO EXISTE NA IMAGEM AQUI']),
        page(4, ['Texto da pagina quatro que esta no livro sem marcador']),
        page(5, ['ROTULO DE FIGURA QUE O LIVRO NAO TEM AQUI', 'Texto da pagina cinco que esta no livro depois da figura']),
    ];
    pages[1].items.push(it('Marketing 7.indd 2', 50, 20));
    const html = '<p>Texto da pagina um <span class="pagebreak" data-page="1"></span>que esta no livro com marcador</p>'
        + '<p>Texto da pagina quatro que esta no livro sem marcador</p><p>Texto da pagina cinco que esta no livro depois da figura</p><p><span class="pagebreak" data-page="99"></span></p>';
    const a = auditPageList(pages, html);
    expect(a.marked).toBe(1);
    expect(a.missing).toEqual([{ page: 2, reason: 'branca' }, { page: 3, reason: 'figura' }, { page: 4, reason: 'fora-de-ordem' }, { page: 5, reason: 'abre-com-figura' }]);
    expect(a.orphanMarkers).toEqual([99]);
    expect(a.pagesWithFolio).toBe(a.marked + a.missing.length);
});
