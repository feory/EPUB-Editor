import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import JSZip from 'jszip';
import { extractEpub } from './epub-importer';

// extractEpub usa DOMParser/document globais (browser)
beforeAll(() => {
    const win = new Window();
    Object.assign(globalThis, { DOMParser: win.DOMParser, document: win.document });
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

async function makeEpub(opts: { declareCover: boolean }) {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    zip.file('OEBPS/image/capa.jpg', JPEG);
    const page = (body: string) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>T</title></head><body>${body}</body></html>`;
    zip.file('OEBPS/cover.xhtml', page('<img src="image/capa.jpg" alt=""/>'));
    zip.file('OEBPS/c1.xhtml', page('<h1>Um</h1><p>texto</p>'));
    zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Livro</dc:title><dc:identifier>9789720000000</dc:identifier>${opts.declareCover ? '<meta name="cover" content="capa"/>' : ''}</metadata>
<manifest><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="capa" href="image/capa.jpg" media-type="image/jpeg"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="cover" linear="no"/><itemref idref="c1"/></spine></package>`);
    return new File([await zip.generateAsync({ type: 'uint8array' })], 'livro.epub');
}

test('extractEpub devolve a capa declarada no OPF (meta name="cover") e não a põe na galeria', async () => {
    const { cover, images } = await extractEpub(await makeEpub({ declareCover: true }));
    expect(cover?.type).toBe('image/jpeg');
    expect(new Uint8Array(await cover!.arrayBuffer())).toEqual(JPEG);
    expect(images.size).toBe(0);
});

test('extractEpub sem capa declarada usa a imagem da página de capa (cover.xhtml)', async () => {
    const { cover, images } = await extractEpub(await makeEpub({ declareCover: false }));
    expect(new Uint8Array(await cover!.arrayBuffer())).toEqual(JPEG);
    expect(images.size).toBe(0);
});
