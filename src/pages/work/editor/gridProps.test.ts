import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { applyGridProps, readGridProps, EMPTY_GRID, addGridCell, cellOf, isGridEmpty, applyGridToCells, type GridDom } from './gridProps';
import { cleanEditorDOM } from '../../../utils/html-cleaner';

const doc = new Window().document;
const dom: GridDom = { setStyle: (el, n, v) => { if (v) el.style.setProperty(n, v); else el.style.removeProperty(n); } };

test('applyGridProps escreve e lê de volta; EMPTY_GRID repõe', () => {
    const el = doc.createElement('div') as unknown as HTMLElement;
    applyGridProps(dom, el, { ratio: '1fr 2fr', gap: 2, borderColor: '#334155', borderWidth: 2, borderStyle: 'dashed', radius: 6, padding: 1, background: '#f1f5f9' });
    expect(readGridProps(el)).toMatchObject({ ratio: '1fr 2fr', gap: 2, borderWidth: 2, borderStyle: 'dashed', radius: 6, padding: 1 });
    applyGridProps(dom, el, EMPTY_GRID);
    expect(readGridProps(el)).toEqual(EMPTY_GRID);
});

test('cleanEditorDOM mantém o parágrafo vazio único de cada coluna (senão fica não editável)', () => {
    const body = doc.createElement('div') as unknown as HTMLElement;
    body.innerHTML = '<div class="grid"><div class="col"><p><br></p></div><div class="col"><p>x</p><p><br></p></div></div><p><br></p>';
    cleanEditorDOM(body);
    expect(body.innerHTML).toBe('<div class="grid"><div class="col"><p><br></p></div><div class="col"><p>x</p></div></div>');
});

test('grelha nasce vazia; o + acrescenta coluna, texto ou imagem (parágrafo) no fim ou depois da célula ativa', () => {
    const g = doc.createElement('div') as unknown as HTMLElement;
    g.className = 'grid';
    g.innerHTML = '<br data-mce-bogus="1">';
    expect(isGridEmpty(g)).toBe(true);
    const p1 = addGridCell(g, 'col', null);
    expect(g.innerHTML).toBe('<div class="col"><p><br data-mce-bogus="1"></p></div>'); // o <br> de preenchimento saiu
    expect(isGridEmpty(g)).toBe(false);
    const p2 = addGridCell(g, 'text', null);
    const p3 = addGridCell(g, 'image', cellOf(g, p1)); // depois da 1.ª célula
    expect(Array.from(g.children).map((c) => c.nodeName + (c.className ? '.' + c.className : ''))).toEqual(['DIV.col', 'P', 'P']);
    expect(g.children[1]).toBe(p3);
    expect(g.children[2]).toBe(p2);
});

test('cellOf devolve o filho direto da grelha que contém o nó; fora da grelha, null', () => {
    const g = doc.createElement('div') as unknown as HTMLElement;
    g.innerHTML = '<div class="col"><p id="a">x</p></div><p id="b">y</p>';
    expect(cellOf(g, g.querySelector('#a')!)?.className).toBe('col');
    expect(cellOf(g, g.querySelector('#b')!)?.id).toBe('b');
    expect(cellOf(g, doc.createElement('p') as unknown as Node)).toBeNull();
});

test('aplicar às células copia contorno, cantos e fundo da grelha a cada filho; sem valor, remove', () => {
    const g = doc.createElement('div') as unknown as HTMLElement;
    g.innerHTML = '<div class="col"></div><p></p><br>';
    applyGridProps(dom, g, { borderWidth: 3, borderStyle: 'solid', borderColor: '#111111', radius: 4 });
    applyGridToCells(dom, g);
    for (const cell of [g.children[0], g.children[1]] as HTMLElement[]) {
        expect(cell.style.borderWidth).toBe('3px');
        expect(cell.style.borderRadius).toBe('4px');
    }
    applyGridProps(dom, g, { borderWidth: null });
    applyGridToCells(dom, g);
    expect((g.children[0] as HTMLElement).style.borderWidth).toBe('');
});
