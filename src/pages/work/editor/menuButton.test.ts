import { test, expect } from 'bun:test';
import { layoutMenuButton, layoutBoxBar, layoutGridPlus, layoutParentHandle, type MenuButtonInput } from './menuButton';

const base: MenuButtonInput = { item: { top: 200, right: 400 }, iframe: { top: 100, left: 50, height: 600 }, headerHeight: 57, windowHeight: 900 };

test('botão no canto superior direito do elemento', () => {
    expect(layoutMenuButton(base)).toEqual({ top: 304, left: 422 }); // 100+200+4 · 50+400-4-24
});

test('sem sticky: canto acima do editor, sob a barra da app ou fora do iframe/janela → escondido', () => {
    expect(layoutMenuButton({ ...base, item: { top: -20, right: 400 } })).toBeNull();
    expect(layoutMenuButton({ ...base, iframe: { ...base.iframe, top: 20 }, item: { top: 10, right: 400 } })).toBeNull();
    expect(layoutMenuButton({ ...base, item: { top: 590, right: 400 } })).toBeNull();
    expect(layoutMenuButton({ ...base, windowHeight: 320 })).toBeNull();
});

test('barra da caixa: em cima, alinhada à esquerda; presa ao topo visível com scroll; esconde-se quando a caixa sai', () => {
    const common = { iframe: base.iframe, topBound: 57, windowHeight: 900 };
    const box = (top: number, bottom: number) => ({ top, bottom, left: 30 });
    expect(layoutBoxBar({ ...common, item: box(200, 400) })).toEqual({ top: 100 + 200 - 48 - 4, left: 50 + 30 - 4 }); // por cima
    // sem espaço por cima: presa ao topo visível (iframe.top=100 > topBound) enquanto a caixa tem parte à vista
    expect(layoutBoxBar({ ...common, item: box(10, 300) })).toEqual({ top: 100 + 4, left: 76 });
    expect(layoutBoxBar({ ...common, iframe: { ...base.iframe, top: 0 }, topBound: 140, item: box(-20, 300) })).toEqual({ top: 144, left: 76 }); // sob a barra principal
    expect(layoutBoxBar({ ...common, item: box(-300, -10) })).toBeNull();           // caixa já saiu
    expect(layoutBoxBar({ ...common, item: box(-100, 8) })).toBeNull();             // presa, mas já sem caixa por baixo
});

test('+ da grelha: ao centro se vazia; na borda inferior se tem células; escondido fora de vista', () => {
    const grid = { top: 200, bottom: 260, left: 100, right: 500 };
    const common = { iframe: base.iframe, headerHeight: 57, windowHeight: 900 };
    expect(layoutGridPlus({ ...common, grid, empty: true })).toEqual({ top: 100 + 230 - 12, left: 50 + 300 - 12 });
    expect(layoutGridPlus({ ...common, grid, empty: false })).toEqual({ top: 100 + 262 - 12, left: 50 + 300 - 12 });
    expect(layoutGridPlus({ ...common, grid: { ...grid, top: -300, bottom: -250 }, empty: false })).toBeNull();
});

test('pega do contentor: na margem esquerda junto ao topo; sem margem, dentro; fora de vista não aparece', () => {
    const common = { iframe: base.iframe, headerHeight: 57, windowHeight: 900 };
    expect(layoutParentHandle({ ...common, container: { top: 200, left: 100 } })).toEqual({ top: 100 + 204, left: 50 + 100 - 24 - 4 });
    expect(layoutParentHandle({ ...common, container: { top: 200, left: 10 } })).toEqual({ top: 304, left: 50 + 10 + 4 });
    expect(layoutParentHandle({ ...common, container: { top: -80, left: 100 } })).toBeNull();
});
