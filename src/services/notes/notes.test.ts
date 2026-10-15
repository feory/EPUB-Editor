import { test, expect } from 'bun:test';
import JSZip from 'jszip';
import { Window } from 'happy-dom';
import { linkFootnotes } from './notes';

const win = new Window() as unknown as Record<string, unknown>;
Object.assign(globalThis, { DOMParser: win.DOMParser, document: win.document, NodeFilter: win.NodeFilter, window: win });

const refs = (html: string) => (html.match(/epub:type="noteref"/g) || []).length;
const defs = (html: string) => (html.match(/epub:type="footnote"/g) || []).length;

test('linkFootnotes: ref → noteref, definição → aside com backlink; nº de refs == nº de definições', () => {
    const out = linkFootnotes('<p>A<sup>1</sup> B<sup>2</sup></p><p id="footnote-1" class="footnote"><sup>1</sup> Um</p><p id="footnote-2" class="footnote"><sup>2</sup> Dois</p>');
    expect(refs(out)).toBe(2);
    expect(defs(out)).toBe(2);
    expect(out).toContain('role="doc-backlink"');
});

test('linkFootnotes: aceita id antes ou depois da classe (importadores não normalizam como o TinyMCE)', () => {
    const out = linkFootnotes('<p>A<sup>1</sup></p><p class="footnote" id="footnote-1"><sup>1</sup> Um</p>');
    expect(refs(out)).toBe(1);
    expect(defs(out)).toBe(1);
});

test('ida e volta: EPUB com notas semânticas → modelo da app → export → as mesmas notas', async () => {
    const { extractEpub } = await import('../import/epub-importer');
    const z = new JSZip();
    z.file('mimetype', 'application/epub+zip');
    z.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
    z.file('OEBPS/content.opf', '<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>');
    z.file('OEBPS/c.xhtml', '<html xmlns:epub="http://www.idpf.org/2007/ops"><head><title>C</title></head><body><h1>Cap</h1><p>Texto<sup id="r1"><a epub:type="noteref" role="doc-noteref" href="#n1">1</a></sup></p>'
        + '<aside id="n1" epub:type="footnote" role="doc-footnote" class="footnote"><p><sup><a href="#r1" role="doc-backlink">1</a></sup> Nota um</p></aside></body></html>');
    const { html } = await extractEpub(new File([await z.generateAsync({ type: 'arraybuffer' })], 'a.epub'));
    expect(html).toContain('<sup>1</sup>'); // modelo da app: ref simples
    const out = linkFootnotes(html);
    expect(refs(out)).toBe(1);
    expect(defs(out)).toBe(1);
    expect(out).toContain('Nota um');
});

test('import: duas chamadas de nota seguidas no mesmo <sup> ficam as duas (uma por nota)', async () => {
    const { extractEpub } = await import('../import/epub-importer');
    const z = new JSZip();
    z.file('mimetype', 'application/epub+zip');
    z.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
    z.file('OEBPS/content.opf', '<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>T</dc:title></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>');
    z.file('OEBPS/c.xhtml', '<html xmlns:epub="http://www.idpf.org/2007/ops"><head><title>C</title></head><body><h1>Cap</h1>'
        + '<p>Texto<sup><a epub:type="noteref" role="doc-noteref" href="#n1">1</a> <a epub:type="noteref" role="doc-noteref" href="#n2">2</a></sup></p>'
        + '<aside id="n1" epub:type="footnote" role="doc-footnote" class="footnote"><p><sup><a role="doc-backlink" href="#r">1</a></sup> Um</p></aside>'
        + '<aside id="n2" epub:type="footnote" role="doc-footnote" class="footnote"><p><sup><a role="doc-backlink" href="#r">2</a></sup> Dois</p></aside></body></html>');
    const { html } = await extractEpub(new File([await z.generateAsync({ type: 'arraybuffer' })], 'a.epub'));
    expect(html).toContain('<sup>1</sup> <sup>2</sup>');
    expect(refs(linkFootnotes(html))).toBe(2);
});
