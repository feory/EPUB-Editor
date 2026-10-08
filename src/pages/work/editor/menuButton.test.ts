import { test, expect } from 'bun:test';
import { layoutDeleteButtons, type DeleteLayoutInput } from './deleteButtons';

const base: DeleteLayoutInput = { item: null, container: null, iframe: { top: 100, left: 50, height: 600 }, headerHeight: 57, windowHeight: 900 };

test('botão do elemento no canto superior direito, sem folga ao topo da área visível', () => {
    expect(layoutDeleteButtons({ ...base, item: { top: 200, right: 400 } }))
        .toEqual([{ top: 304, left: 422, container: false }]); // 100+200+4 · 50+400-4-24
});

test('sem sticky: canto acima do editor, sob a barra da app ou fora da janela → escondido', () => {
    expect(layoutDeleteButtons({ ...base, item: { top: -20, right: 400 } })).toEqual([]);            // acima do editor
    expect(layoutDeleteButtons({ ...base, iframe: { ...base.iframe, top: 20 }, item: { top: 10, right: 400 } })).toEqual([]); // sob a barra
    expect(layoutDeleteButtons({ ...base, item: { top: 590, right: 400 } })).toEqual([]);            // fora do iframe
});

test('botão do contentor: por cima, sem tocar no do elemento', () => {
    const [item, box] = layoutDeleteButtons({ ...base, item: { top: 200, right: 400 }, container: { top: 200, right: 400 } });
    expect(box.container).toBe(true);
    expect(box.top + 24).toBeLessThanOrEqual(item.top); // todo acima do botão do elemento
    expect(box.left).toBe(item.left);
});

test('contentor colado ao topo: desce para dentro, à esquerda do botão do elemento', () => {
    const [item, box] = layoutDeleteButtons({ ...base, item: { top: 10, right: 400 }, container: { top: 10, right: 400 } });
    expect(box.top).toBe(item.top);
    expect(box.left).toBe(item.left - 28);
});

test('contentor com o canto fora de vista não tem botão', () => {
    expect(layoutDeleteButtons({ ...base, container: { top: -50, right: 400 } })).toEqual([]);
});
