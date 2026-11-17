import { test, expect, beforeEach } from 'bun:test';

(globalThis as { window?: unknown }).window = { innerHeight: 800 };
let pop: { top: number; bottom: number; left: number } | null = null;
(globalThis as { document?: unknown }).document = { querySelector: () => (pop ? { getBoundingClientRect: () => pop } : null) };
const { openUpIfClipped, placePanelBesideMiniMenu } = await import('./popupDismiss');

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

test('painel junto ao mini-menu: cabe por baixo → por baixo (top)', () => {
    pop = { top: 100, bottom: 148, left: 50 };
    expect(placePanelBesideMiniMenu(440)).toEqual({ top: 152, maxHeight: 640 });
});

test('últimos parágrafos (pouco espaço por baixo): por cima, ancorado pelo fundo, e fica aí', () => {
    pop = { top: 600, bottom: 648, left: 50 };
    const r = placePanelBesideMiniMenu(440);
    expect(r.top).toBeUndefined();
    expect(r.bottom).toBe(800 - 596); // 204: o painel acaba 4px por cima do mini-menu
    expect(r.maxHeight).toBe(588);
});
