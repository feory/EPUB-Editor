import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { blockCssInfo } from './cssInfo';

const root = () => { const d = new Window().document; d.body.innerHTML = '<h1 class="mce-x p-center" style="color: red;">Capítulo <span style="background: #000; color: #fff; padding: 0.15em 0.6em;"><em class="c-a">1</em></span></h1><p>texto</p>'; return d; };

test('cursor no bloco: seletor com classes e style do bloco (ignora as classes mce-)', () => {
    const d = root();
    expect(blockCssInfo(d.querySelector('h1')! as unknown as Element, d.querySelector('h1')! as unknown as Element)).toBe('h1.p-center { color: red; }');
    expect(blockCssInfo(d.querySelector('p')! as unknown as Element, d.querySelector('p')! as unknown as Element)).toBe('p');
});

test('cursor dentro de elementos em linha: mostra a cadeia com o código inline de cada um', () => {
    const d = root();
    const span = d.querySelector('span')! as unknown as Element;
    expect(blockCssInfo(d.querySelector('h1')! as unknown as Element, span)).toBe('h1.p-center { color: red; } > span { background: #000; color: #fff; padding: 0.15em 0.6em; }');
    expect(blockCssInfo(d.querySelector('h1')! as unknown as Element, d.querySelector('em')! as unknown as Element)).toContain('> span { background: #000; color: #fff; padding: 0.15em 0.6em; } > em.c-a');
});
