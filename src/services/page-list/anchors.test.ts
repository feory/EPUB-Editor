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
