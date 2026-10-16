import { test, expect } from 'bun:test';
import { compressHtml, compressHtmlAsync, decompressHtml } from './compression';

const html = '<p>Olá, ação — </p>'.repeat(5000);

test('compressHtmlAsync: ida e volta, com acentos e texto grande', async () => {
    const c = await compressHtmlAsync(html);
    expect(c.startsWith('UNCOMPRESSED:')).toBe(false);
    expect(decompressHtml(c)).toBe(html);
});

test('compressHtmlAsync e compressHtml dão o mesmo resultado (o servidor não distingue)', async () => {
    expect(decompressHtml(await compressHtmlAsync(html))).toBe(decompressHtml(compressHtml(html)));
});
