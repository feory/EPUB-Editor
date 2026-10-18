import { test, expect } from 'bun:test';
import JSZip from 'jszip';
import { stripPlaceholderImages, replaceImageUrlsInContent, addImagesToArchive } from './image-utils';

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

test('replaceImageUrlsInContent preserva o alt escrito pelo utilizador', () => {
    const images = new Map([['a', new Blob(['x'], { type: 'image/jpeg' })]]);
    expect(replaceImageUrlsInContent('<img src="x" alt="Mapa de Moçambique" data-image-id="a">', images)).toContain('alt="Mapa de Moçambique"');
    expect(replaceImageUrlsInContent('<img src="x" alt="Imagem importada" data-image-id="a">', images)).toContain('alt="Imagem a"');
});

test('addImagesToArchive: ids do manifest não colidem com os fixos do OPF nem entre si', () => {
    const png = () => new Blob(['x'], { type: 'image/png' });
    const images = new Map([['cover', png()], ['style', png()], ['section1', png()], ['a b', png()], ['a_b', png()]]);
    const { manifestItems } = addImagesToArchive(images, new JSZip().folder('Images')!);
    const ids = [...manifestItems.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const reserved of ['cover', 'style', 'section1']) expect(ids).not.toContain(reserved);
});
