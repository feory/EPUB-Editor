import { test, expect } from 'bun:test';
import { pointImagesToServer, uploadExtractedImages, uploadName } from './extracted-images';

test('pointImagesToServer: troca só o src; alt/class ficam; sem alt → alt genérico; alt="" mantém-se', () => {
    const html = '<p><img class="img-full" alt="Mapa de Lisboa" src="placeholder" data-image-id="a1" /></p>'
        + '<img data-image-id="b2" src="placeholder" />'
        + '<img data-image-id="c3" src="placeholder" alt="" />'
        + '<img src="/x.png" />';
    expect(pointImagesToServer(html, '978')).toBe(
        '<p><img class="img-full" alt="Mapa de Lisboa" src="/api/ebooks/978/images/a1" data-image-id="a1" /></p>'
        + '<img alt="Imagem importada" data-image-id="b2" src="/api/ebooks/978/images/b2" />'
        + '<img data-image-id="c3" src="/api/ebooks/978/images/c3" alt="" />'
        + '<img src="/x.png" />');
});

test('uploadName: extensão real; EPS/PSD para o servidor converter', () => {
    expect(uploadName('a', new Blob([], { type: 'image/jpeg' }))).toBe('a.jpeg');
    expect(uploadName('b', new Blob([], { type: 'application/postscript' }))).toBe('b.eps');
    expect(uploadName('c', new Blob([], { type: 'image/vnd.adobe.photoshop' }))).toBe('c.psd');
    expect(uploadName('d', new Blob([]))).toBe('d.png');
});

test('uploadExtractedImages: sobe todas num FormData e aponta o HTML; sem imagens não sobe nada', async () => {
    const sent: FormData[] = [];
    const html = await uploadExtractedImages('978', '<img data-image-id="a" src="placeholder" alt="x" />',
        new Map([['a', new Blob([], { type: 'image/png' })]]), async fd => { sent.push(fd); });
    expect(html).toBe('<img data-image-id="a" src="/api/ebooks/978/images/a" alt="x" />');
    expect((sent[0].getAll('images')[0] as File).name).toBe('a.png');
    await uploadExtractedImages('978', '', new Map(), async fd => { sent.push(fd); });
    expect(sent.length).toBe(1);
});
