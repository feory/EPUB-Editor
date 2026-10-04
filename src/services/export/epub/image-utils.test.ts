import { test, expect } from 'bun:test';
import { stripPlaceholderImages } from './image-utils';

test('stripPlaceholderImages: remove parágrafo cujo único conteúdo é a imagem placeholder', () => {
    const html = '<p class="p-center"><img src="placeholder" alt="" data-image-id="Moçambique_160x230"></p>';
    expect(stripPlaceholderImages(html)).toBe('');
});

test('stripPlaceholderImages: remove várias ocorrências, mantém o resto do livro', () => {
    const html = '<p>corpo</p>'
        + '<p class="p-center"><img src="placeholder" alt="" data-image-id="a"></p>'
        + '<p>meio</p>'
        + '<p class="p-center"><img src="placeholder" alt="" data-image-id="b"></p>'
        + '<p>fim</p>';
    expect(stripPlaceholderImages(html)).toBe('<p>corpo</p><p>meio</p><p>fim</p>');
});

test('stripPlaceholderImages: imagem já resolvida (src real) não é tocada', () => {
    const html = '<p class="p-center"><img src="Images/Moçambique_160x230.jpg" alt="Imagem"></p>';
    expect(stripPlaceholderImages(html)).toBe(html);
});

test('stripPlaceholderImages: sem imagens placeholder devolve inalterado', () => {
    const html = '<p>Só texto normal.</p>';
    expect(stripPlaceholderImages(html)).toBe(html);
});
