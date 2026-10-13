import { test, expect } from 'bun:test';
import { gripState, gripZone, dropTargetAt, hitsPlus, changeDetector } from '../blockInteraction';
import { GRIP_HEIGHT } from '../blockGeometry';

const block = { left: 100, top: 200, bottom: 300 };

test('pega: rato longe → escondida; perto da linha esquerda → visível; em cima dela → overGrip', () => {
    expect(gripState({ x: 600, y: 250 }, block, null, 800)).toEqual({ top: null, overGrip: false });
    const near = gripState({ x: 90, y: 250 }, block, null, 800);
    expect(near.top).not.toBeNull();
    const on = gripState({ x: 100 - 3 - 10, y: near.top! + GRIP_HEIGHT / 2 }, block, near.top, 800);
    expect(on.overGrip).toBe(true);
    expect(gripState({ x: 90, y: 250 }, null, near.top, 800)).toEqual({ top: null, overGrip: false });
});

test('pega: já em cima dela, continua visível mesmo fora da faixa "perto" (não desaparece ao tocar)', () => {
    const near = gripState({ x: 90, y: 250 }, block, null, 800);
    const mouse = { x: 100 - 3 - 10, y: near.top! + 5 }; // dentro da pega
    expect(gripState(mouse, block, near.top, 800).top).not.toBeNull();
    expect(gripZone(mouse, block.left, near.top)).not.toBeNull();
    expect(gripZone(mouse, block.left, null)).toBeNull();
});

test('arrastar: antes do bloco cujo ponto médio está abaixo do rato; no fim, depois do último', () => {
    const rects = [{ top: 0, bottom: 20 }, { top: 20, bottom: 60 }, { top: 60, bottom: 80 }];
    expect(dropTargetAt(5, rects)).toEqual({ index: 0, pos: 'before' });
    expect(dropTargetAt(45, rects)).toEqual({ index: 2, pos: 'before' });
    expect(dropTargetAt(500, rects)).toEqual({ index: 2, pos: 'after' });
    expect(dropTargetAt(10, [])).toBeNull();
});

test('"+": só dentro do círculo centrado na borda inferior', () => {
    const b = { left: 0, width: 200 };
    expect(hitsPlus(100, 300, b, 300)).toBe(true);
    expect(hitsPlus(100 + 11, 300, b, 300)).toBe(true);
    expect(hitsPlus(100 + 12, 300, b, 300)).toBe(false);
    expect(hitsPlus(100, 330, b, 300)).toBe(false);
});

test('changeDetector: true só quando a chave muda', () => {
    const changed = changeDetector();
    expect([changed('a'), changed('a'), changed('b'), changed('a')]).toEqual([true, false, true, true]);
});
