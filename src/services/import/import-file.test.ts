import { test, expect } from 'bun:test';
import JSZip from 'jszip';
import { Window } from 'happy-dom';
import '../indesign/happy-dom';

// cleanEditorHtml / sanitize usam estes globais do browser (o indesign/happy-dom só regista DOMParser).
const win = new Window() as unknown as Record<string, unknown>;
for (const k of ['NodeFilter', 'Node', 'Element', 'HTMLElement', 'Text', 'document']) (globalThis as Record<string, unknown>)[k] ??= win[k];
(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
(globalThis as Record<string, unknown>).window ??= win; // DOMPurify (document-importer) inicializa-se com o window global

const { detectFormat, importFile, finalizeImport } = await import('./import-file');

const OPTIONS = { indentAllParagraphs: false, topOnBoldParagraphs: false, noIndentAfterBold: false, wrapBoldWithNext: false, convertListsToDialogue: false };
const noUpload = { isbn: '1', uploadImages: async () => undefined };
const file = (name: string, type = '') => new File(['x'], name, { type });

test('detectFormat: um formato por extensão/tipo, null para o resto', () => {
    expect(detectFormat(file('a.PDF'))).toBe('pdf');
    expect(detectFormat(file('a', 'application/pdf'))).toBe('pdf');
    expect(detectFormat(file('a.docx'))).toBe('docx');
    expect(detectFormat(file('a.htm'))).toBe('html');
    expect(detectFormat(file('a.idml'))).toBe('idml');
    expect(detectFormat(file('a.zip'))).toBe('idml');
    expect(detectFormat(file('a.epub'))).toBe('epub');
    expect(detectFormat(file('a.txt'))).toBeNull();
});

test('política: heurístico (html) leva Ficha Técnica; estruturado (epub/idml) não', async () => {
    const html = '<h1>Título</h1><p>Texto</p>';
    const heur = await finalizeImport({ format: 'html', html, images: new Map() }, { options: OPTIONS }, noUpload);
    expect(heur.html.startsWith('<p class="chapter-break" data-title="Ficha Técnica">')).toBe(true);
    for (const format of ['epub', 'idml'] as const) {
        const r = await finalizeImport({ format, html, images: new Map() }, { options: OPTIONS }, noUpload);
        expect(r.html).not.toContain('Ficha Técnica');
    }
});

test('finalizeImport: sobe as imagens e aponta o src para o servidor; devolve os avisos do extrator', async () => {
    const uploaded: string[] = [];
    const r = await finalizeImport(
        { format: 'epub', html: '<p><img data-image-id="a" src="placeholder" alt="x"></p>', images: new Map([['a', new Blob(['i'], { type: 'image/png' })]]), pageBreaks: { inserted: 1, total: 2 }, figuresPlaced: 3 },
        { options: OPTIONS }, { isbn: '999', uploadImages: async (fd) => { uploaded.push(...(fd.getAll('images') as File[]).map(f => f.name)); } },
    );
    expect(uploaded).toEqual(['a.png']);
    expect(r.html).toContain('src="/api/ebooks/999/images/a"');
    expect(r.pageBreaks).toEqual({ inserted: 1, total: 2 });
    expect(r.figuresPlaced).toBe(3);
});

test('importFile: EPUB mínimo → HTML estruturado com metadados, sem Ficha Técnica automática', async () => {
    const z = new JSZip();
    z.file('mimetype', 'application/epub+zip');
    z.file('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>');
    z.file('OEBPS/content.opf', '<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Livro</dc:title><dc:creator>Autor</dc:creator></metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>');
    z.file('OEBPS/c.xhtml', '<html><head><title>Cap</title></head><body><h1>Capítulo 1</h1><p>Olá</p></body></html>');
    const epub = new File([await z.generateAsync({ type: 'arraybuffer' })], 'livro.epub');
    const r = await importFile(epub, { options: OPTIONS }, noUpload);
    expect(r.html).toContain('Capítulo 1');
    expect(r.html).not.toContain('Ficha Técnica');
    expect(r.metadata?.title).toBe('Livro');
});
