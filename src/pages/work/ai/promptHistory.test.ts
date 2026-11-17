import { test, expect } from 'bun:test';
import { recallStep, recalled } from './promptHistory';

test('↑ vai para trás até ao mais antigo e pára; ↓ volta ao rascunho', () => {
    const seq = (start: number | null, ...dirs: ('up' | 'down')[]) => dirs.reduce<number | null>((at, d) => recallStep(3, at, d), start);
    expect(seq(null, 'up')).toBe(0);
    expect(seq(null, 'up', 'up', 'up', 'up')).toBe(2);
    expect(seq(null, 'up', 'up', 'down')).toBe(0);
    expect(seq(null, 'up', 'down')).toBeNull();
    expect(seq(null, 'down')).toBeNull();
    expect(recallStep(0, null, 'up')).toBeNull(); // sem pedidos anteriores
});

test('recalled: o pedido de trás para a frente, ou o rascunho', () => {
    expect(recalled(['a', 'b', 'c'], 0, 'rasc')).toBe('c');
    expect(recalled(['a', 'b', 'c'], 2, 'rasc')).toBe('a');
    expect(recalled(['a', 'b', 'c'], null, 'rasc')).toBe('rasc');
});
