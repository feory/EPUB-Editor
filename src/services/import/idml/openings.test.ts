import { test, expect } from 'bun:test';
import '../../indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
Object.assign(globalThis, { NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 } });
const { placePartBlocks, placeTitleBlocks } = await import('./openings');

type Item = { str: string; transform: number[] };
const small = (str: string, y: number): Item => ({ str, transform: [1, 0, 0, 1, 50, y] });
const big = (str: string, y: number): Item => ({ str, transform: [30, 0, 0, 30, 50, y] });
const page = (folio: number, items: Item[]) => ({ vpH: 800, items: [small(String(folio), 750), small('CABECALHO CORRENTE', 750), ...items] });
// p.2 = abertura da Parte, p.3 = abertura do capítulo (só títulos), p.4 = 1.ª página com corpo.
const pages = async () => [
    page(1, [small('Texto da pagina um com texto suficiente aqui', 600)]),
    page(2, [big('PARTE I', 600), big('A aproximacao da mente humana', 560)]),
    page(3, [big('CAPITULO UM', 600), big('O caminho rumo ao marketing', 560)]),
    page(4, [small('Primeira linha do capitulo um com texto suficiente aqui', 600)]),
];
const body = '<p>Texto da pagina um com texto suficiente aqui</p><p>Primeira linha do capitulo um com texto suficiente aqui</p>';
const part = { html: '<h1>PARTE I</h1>', searchKey: 'PARTE I A aproximacao da mente humana' };
const chapter = { html: '<h1>CAPITULO UM</h1>', searchKey: 'CAPITULO UM O caminho rumo ao marketing' };
const lost = { html: '<h1>PARTE ZZ</h1>', searchKey: 'PARTE ZZ Titulo que nao existe no PDF' };

test('placePartBlocks: Parte e capítulo que abrem na mesma página entram juntos, por ordem, antes do 1.º bloco com corpo', async () => {
    const out = await placePartBlocks(body, [part, chapter], pages);
    expect(out).toBe('<p>Texto da pagina um com texto suficiente aqui</p><h1>PARTE I</h1>\n<h1>CAPITULO UM</h1><p>Primeira linha do capitulo um com texto suficiente aqui</p>');
});

test('placePartBlocks: a que não tem âncora no PDF vai para o fim (não se perde); sem PDF vão todas para o fim', async () => {
    const out = await placePartBlocks(body, [part, lost], pages);
    expect(out.endsWith('\n<h1>PARTE ZZ</h1>')).toBe(true);
    expect(out).toContain('<h1>PARTE I</h1><p>Primeira linha');
    expect(await placePartBlocks(body, [part, chapter], undefined)).toBe(`${body}\n<h1>PARTE I</h1>\n<h1>CAPITULO UM</h1>`);
    expect(await placePartBlocks(body, [], pages)).toBe(body);
});

test('placeTitleBlocks: com PDF ancora o título; sem PDF (ou sem blocos) não mexe', async () => {
    expect(await placeTitleBlocks(body, [chapter], pages)).toContain('<h1>CAPITULO UM</h1><p>Primeira linha');
    expect(await placeTitleBlocks(body, [chapter], undefined)).toBe(body);
    expect(await placeTitleBlocks(body, [], pages)).toBe(body);
});
