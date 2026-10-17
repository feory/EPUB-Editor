import { test, expect } from 'bun:test';
import { unwrapCommentAnchor } from './comment-anchor';

const A = (id: string, inner: string, cls = 'comment-anchor') => `<span class="${cls}" data-comment-id="${id}">${inner}</span>`;

test('tira o span e deixa o texto', () => {
    expect(unwrapCommentAnchor(`<p>antes ${A('c1', 'marcado')} depois</p>`, 'c1')).toBe('<p>antes marcado depois</p>');
});

test('só o span pedido; os outros comentários ficam', () => {
    const html = `<p>${A('c1', 'um')} e ${A('c2', 'dois')}</p>`;
    expect(unwrapCommentAnchor(html, 'c1')).toBe(`<p>um e ${A('c2', 'dois')}</p>`);
});

test('spans aninhados dentro do anchor: fecha no par certo', () => {
    const html = `<p>${A('c1', 'a <span class="x">b</span> c')} resto</p>`;
    expect(unwrapCommentAnchor(html, 'c1')).toBe('<p>a <span class="x">b</span> c resto</p>');
});

test('anchor resolvido (classe extra) e atributos noutra ordem', () => {
    expect(unwrapCommentAnchor(`<p>${A('c1', 'x', 'comment-anchor comment-anchor-resolved')}</p>`, 'c1')).toBe('<p>x</p>');
    expect(unwrapCommentAnchor('<p><span data-comment-id="c1" class="comment-anchor">x</span></p>', 'c1')).toBe('<p>x</p>');
});

test('id inexistente, id com caracteres de regex e HTML sem fecho não mexem / não rebentam', () => {
    const html = `<p>${A('c1', 'x')}</p>`;
    expect(unwrapCommentAnchor(html, 'c9')).toBe(html);
    expect(unwrapCommentAnchor(`<p>${A('a.b', 'x')}${A('aXb', 'y')}</p>`, 'a.b')).toBe(`<p>x${A('aXb', 'y')}</p>`);
    const broken = '<p><span class="comment-anchor" data-comment-id="c1">x</p>';
    expect(unwrapCommentAnchor(broken, 'c1')).toBe(broken);
});
