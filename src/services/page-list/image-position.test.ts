import { test, expect } from 'bun:test';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
const { biggestGap, anchorBefore, anchorAfter } = await import('./pdf-text');

const ys = (...v: number[]) => v.map((y) => ({ y }));

test('biggestGap: a quebra bem maior que a entrelinha é onde a imagem empurra o texto', () => {
    expect(biggestGap(ys(700, 686, 672, 560, 546, 532))).toBe(3);
});

test('biggestGap: espaçamento normal (ou menos de 2 linhas) não é imagem', () => {
    expect(biggestGap(ys(700, 686, 672, 658))).toBeNull();
    expect(biggestGap(ys(700))).toBeNull();
    expect(biggestGap(ys(700, 686, 660, 646))).toBeNull(); // 26 vs 14: < 3×
});

test('anchorBefore/anchorAfter juntam linhas até ao tamanho mínimo', () => {
    const lines = [{ text: 'primeira linha' }, { text: 'curta' }, { text: 'outra' }];
    expect(anchorBefore(lines, 2, 12)).toBe('primeira linhacurtaoutra');
    expect(anchorAfter(lines, 0, 5)).toBe('primeira linha');
    expect(anchorAfter(lines, 1, 12)).toBe('curtaoutra');
});
