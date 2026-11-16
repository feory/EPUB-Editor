import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
Object.assign(globalThis, { NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 } }); // o walker de textIndex também lê elementos (marcadores)
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

const { fillMissingPageBreaks, pageLinesFromPages } = await import('./page-list');

test('fillMissingPageBreaks: só dentro da janela entre os marcadores vizinhos; idempotente; não toca nos existentes', () => {
    const html = '<p>Texto da pagina um que esta no livro <span class="pagebreak" data-page="1"></span>fim</p>'
        + '<p>Linha que abre a pagina dois no livro aqui</p><p>Texto da pagina tres <span class="pagebreak" data-page="3"></span>que esta</p>'
        + '<p>Linha que abre a pagina dois no livro aqui</p>'; // repetida DEPOIS do marcador 3: fora da janela da página 2
    const pages = [{ page: 2, lines: [normalize('Linha que abre a pagina dois no livro aqui').slice(0, 30)] }];
    const r = fillMissingPageBreaks(html, pages);
    expect(r.inserted).toEqual([2]);
    expect(r.html.match(/data-page="2"/g)).toHaveLength(1);
    expect(r.html.indexOf('data-page="2"')).toBeLessThan(r.html.indexOf('data-page="3"')); // a 1.ª ocorrência (na janela), não a repetida
    expect(r.html).toContain('<span class="pagebreak" data-page="2"></span>Linha que abre a pagina dois');
    expect(fillMissingPageBreaks(r.html, pages)).toEqual({ html: r.html, inserted: [] }); // idempotente
    expect(fillMissingPageBreaks(html, [{ page: 2, lines: ['nao existe no corpo de todo o livro'] }]).inserted).toEqual([]);
});

test('pageLinesFromPages: só as páginas sem marcador, só as linhas que o livro tem', () => {
    const pages = [1, 2, 3].map(n => page(n, [`ROTULO DE FIGURA QUE O LIVRO NAO TEM ${n}`, `Texto da pagina ${n} que esta no livro mesmo`]));
    const html = '<p>Texto da pagina 1 que esta no livro mesmo <span class="pagebreak" data-page="1"></span></p><p>Texto da pagina 2 que esta no livro mesmo</p>';
    const r = pageLinesFromPages(pages, html);
    expect(r.map(p => p.page)).toEqual([2]); // a 1 já tem marcador; a 3 não tem nenhuma linha no livro
    expect(r[0].lines).toEqual([normalize('Texto da pagina 2 que esta no livro mesmo').slice(0, 30)]);
});

test('fillMissingPageBreaks: um marcador existente fora do sítio não esvazia a janela das páginas do meio', () => {
    const marker = (n: number) => `<span class="pagebreak" data-page="${n}"></span>`;
    // a p.9 está (mal) no princípio, antes das p.1–3: fora de ordem — a janela da p.2 não pode ficar limitada por ela
    const html = `<p>${marker(9)}Texto da pagina um que esta no livro ${marker(1)}fim</p><p>Linha que abre a pagina dois no livro aqui</p><p>Pagina tres ${marker(3)}texto</p>`;
    const r = fillMissingPageBreaks(html, [{ page: 2, lines: [normalize('Linha que abre a pagina dois no livro aqui').slice(0, 30)] }]);
    expect(r.inserted).toEqual([2]);
    expect(r.html).toContain('<span class="pagebreak" data-page="9"></span>Texto'); // o mal colocado fica como estava
});

test('auditPageList: página cujo texto é do Índice e sem marcador → "indice"', () => {
    const pages = [page(1, ['Texto da pagina um que esta no livro com marcador']), page(2, ['Elementos chave do marketing no indice', 'Anexo com os quadros conceptuais do livro'])];
    const html = '<p>Índice</p><p>Elementos chave do marketing no indice</p><p>Anexo com os quadros conceptuais do livro</p><p>Texto da pagina um <span class="pagebreak" data-page="1"></span>que esta no livro com marcador '.padEnd(300, 'x') + '</p>';
    expect(auditPageList(pages, html).missing).toEqual([{ page: 2, reason: 'indice' }]);
});


const { insertPageBreaks } = await import('./page-list');

// Índice com 2 páginas (9, 10) e o título "PARTE I" no corpo com o mesmo texto da 1.ª entrada do Índice.
const ENTRADA = 'Parte I A aproximação da mente humana';
const indiceHtml = `<p>Índice</p><p>${ENTRADA}</p><p>1. O caminho rumo ao marketing 7.0 (entrada)</p><p>Como as redes sociais abrem a mente humana</p><p>2. As ameaças da inteligência artificial geral</p>`;
const corpoHtml = `<h1>PARTE I ${ENTRADA}</h1><p>${'Texto do corpo do capítulo um. '.repeat(8)}</p>`;
const pdfPages = [
    page(9, [ENTRADA, '1. O caminho rumo ao marketing 7.0 (entrada)']),
    page(10, ['Como as redes sociais abrem a mente humana', '2. As ameaças da inteligência artificial geral']),
    page(13, [ENTRADA, 'Texto do corpo do capítulo um. Texto do corpo do capítulo um.']),
];

test('insertPageBreaks: as páginas do Índice têm marcador DENTRO do Índice; o título PARTE I não fica com a página 9', () => {
    const anchors = anchorsFromPages(pdfPages);
    const out = insertPageBreaks(indiceHtml + corpoHtml, anchors).html;
    const iEnd = out.indexOf('<h1>PARTE I');
    expect(out.slice(0, iEnd)).toContain('data-page="9"');   // no Índice
    expect(out.slice(0, iEnd)).toContain('data-page="10"');
    expect(out.slice(iEnd)).not.toContain('data-page="9"');  // não no corpo
    expect(out.slice(iEnd)).toContain('data-page="13"');     // a abertura do capítulo continua no corpo
    expect(out.indexOf('data-page="9"')).toBeLessThan(out.indexOf('data-page="10"'));
});

test('fillMissingPageBreaks: também acrescenta os marcadores das páginas do Índice', () => {
    const html = indiceHtml + corpoHtml;
    const lines = pageLinesFromPages(pdfPages, html);
    const r = fillMissingPageBreaks(html, lines);
    expect(r.inserted).toContain(9);
    expect(r.inserted).toContain(10);
    expect(r.html.slice(r.html.indexOf('<h1>PARTE I'))).not.toContain('data-page="9"');
});
