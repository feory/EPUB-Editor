import { test, expect, beforeEach } from 'bun:test';

(globalThis as { window?: unknown }).window = { innerHeight: 800 };
const { openUpIfClipped } = await import('./popupDismiss');

const el = (scrollHeight: number) => ({ scrollHeight, style: {} as Record<string, string> }) as unknown as HTMLElement & { style: Record<string, string> };
beforeEach(() => { (globalThis as unknown as { window: { innerHeight: number } }).window.innerHeight = 800; });

test('cabe por baixo: fica onde está', () => {
    const e = el(200);
    openUpIfClipped(300)(e);
    expect(e.style.top).toBe('300px');
});

test('cortado por baixo e há mais espaço por cima: abre de baixo para cima, a acabar na âncora', () => {
    const e = el(300);
    openUpIfClipped(700)(e);
    expect(e.style.top).toBe('400px'); // 700 − 300
    expect(e.style.maxHeight).toBeUndefined();
});

test('com `aboveY` (por cima do mini-menu) acaba aí', () => {
    const e = el(300);
    openUpIfClipped(700, 660)(e);
    expect(e.style.top).toBe('360px');
});

test('não cabe em nenhum lado: usa o maior e limita a altura', () => {
    const e = el(900);
    openUpIfClipped(600)(e);
    expect(e.style.top).toBe('8px');
    expect(e.style.maxHeight).toBe('592px');
});

test('mais espaço por baixo do que por cima: mantém-se em baixo', () => {
    const e = el(900);
    openUpIfClipped(100)(e);
    expect(e.style.top).toBe('100px');
});
