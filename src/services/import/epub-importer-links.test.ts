import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

const { adaptInternalLinks } = await import('./epub-importer');

test('adaptInternalLinks: link do Índice vira idx-link; destino ganha chapter-anchor (depois do título, antes do parágrafo)', () => {
    const html = '<p><a href="c1.xhtml#a1">Cap 1</a> <a href="c1.xhtml#a2">Sub</a> <a href="https://x.pt/">ext</a></p>'
        + '<h1><a id="a1"></a>Cap 1</h1><p><a id="a2"></a>Sub</p>';
    const out = adaptInternalLinks(html);
    expect(out).toContain('<span class="idx-link" data-target="idx-anchor-ep1">Cap 1</span>');
    expect(out).toContain('<span class="idx-link" data-target="idx-anchor-ep2">Sub</span>');
    expect(out).toContain('<a href="https://x.pt/">ext</a>'); // externos não se tocam
    expect(out).toMatch(/<\/h1><p class="chapter-anchor" id="idx-anchor-ep1"><\/p>/);
    expect(out).toMatch(/<p class="chapter-anchor" id="idx-anchor-ep2"><\/p><p><a id="a2">/);
});
