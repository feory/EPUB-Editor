import { test, expect } from 'bun:test';
import { imageSrc, imageIdFromSrc, imageIdsOf, bustSrc, bustImageSrcs, imageTag, collectImageIds, renameImageIn } from './book-image';
import { Window } from 'happy-dom';

test('imageSrc / imageIdFromSrc: ida e volta, com ou sem ?v=', () => {
    expect(imageSrc('978', 'Figura_1')).toBe('/api/ebooks/978/images/Figura_1');
    expect(imageIdFromSrc('/api/ebooks/978/images/Figura_1?v=12')).toBe('Figura_1');
    expect(imageIdFromSrc('../api/ebooks/978/images/Figura_1')).toBe('Figura_1');
    expect(imageIdFromSrc('https://x/y.png')).toBeUndefined();
});

test('imageIdsOf: data-image-id e id do src, os dois', () => {
    const img = new Window().document.createElement('img') as unknown as Element;
    img.setAttribute('data-image-id', 'a'); img.setAttribute('src', '/api/ebooks/1/images/b?v=3');
    expect(imageIdsOf(img)).toEqual(['a', 'b']);
});

test('bustSrc substitui o ?v= anterior; bustImageSrcs só mexe nas imagens do servidor', () => {
    expect(bustSrc('/api/ebooks/1/images/a?v=1', 7)).toBe('/api/ebooks/1/images/a?v=7');
    const html = '<img src="/api/ebooks/1/images/a"><img src="/api/ebooks/1/images/b?v=1"><img src="https://x/c.png">';
    expect(bustImageSrcs(html, 7)).toBe('<img src="/api/ebooks/1/images/a?v=7"><img src="/api/ebooks/1/images/b?v=7"><img src="https://x/c.png">');
});

test('imageTag leva id, src e alt', () => {
    expect(imageTag('1', 'a', 'x')).toContain('data-image-id="a" src="/api/ebooks/1/images/a" alt="x"');
});

test('collectImageIds: sem repetidas, data-image-id antes de src, ignora querystring', () => {
    const html = '<img data-image-id="b"><img src="/api/ebooks/123/images/a?thumb=1"><img data-image-id="b"><img src="/api/ebooks/123/images/c">';
    expect(collectImageIds(html)).toEqual(['b', 'a', 'c']);
});

test('renameImageIn: exato — renomear "a" não toca em "ab"; ids com pontos não são regex', () => {
    const html = '<img data-image-id="a" src="/api/ebooks/1/images/a?v=2"><img data-image-id="ab" src="/api/ebooks/1/images/ab">';
    expect(renameImageIn(html, 'a', 'z')).toBe('<img data-image-id="z" src="/api/ebooks/1/images/z?v=2"><img data-image-id="ab" src="/api/ebooks/1/images/ab">');
    expect(renameImageIn('<img data-image-id="a.b">', 'a.b', 'c')).toBe('<img data-image-id="c">');
    expect(renameImageIn('<img data-image-id="axb">', 'a.b', 'c')).toBe('<img data-image-id="axb">');
});
