import { test, expect } from 'bun:test';
import { rowsOfPage, SUPER_Y_TOL } from './pdf-rows';

const it = (str: string, x: number, y: number) => ({ str, transform: [11, 0, 0, 11, x, y] });

test('rowsOfPage: topo→baixo e, em cada linha, da esquerda para a direita', () => {
    const rows = rowsOfPage([it('baixo', 60, 100), it('direita', 200, 700), it('esquerda', 60, 700)]);
    expect(rows.map((r) => r.items.map((i) => i.str))).toEqual([['esquerda', 'direita'], ['baixo']]);
});

test('rowsOfPage: um sobrescrito (y um pouco diferente) fica na linha do corpo; acima da tolerância é outra linha', () => {
    const rows = rowsOfPage([it('texto', 60, 700), it('9', 90, 700 - SUPER_Y_TOL + 1), it('outra', 60, 700 - SUPER_Y_TOL - 1)]);
    expect(rows.map((r) => r.items.map((i) => i.str))).toEqual([['texto', '9'], ['outra']]);
});

test('rowsOfPage: itens vazios saem sempre; os só com espaços saem com dropBlank', () => {
    const items = [it('a', 60, 700), it(' ', 70, 700), it('', 80, 700), it('b', 90, 700)];
    expect(rowsOfPage(items)[0].items.map((i) => i.str)).toEqual(['a', ' ', 'b']);
    expect(rowsOfPage(items, { dropBlank: true })[0].items.map((i) => i.str)).toEqual(['a', 'b']);
});

test('rowsOfPage: não altera a lista que recebe', () => {
    const items = [it('b', 90, 700), it('a', 60, 700)];
    rowsOfPage(items);
    expect(items.map((i) => i.str)).toEqual(['b', 'a']);
});
