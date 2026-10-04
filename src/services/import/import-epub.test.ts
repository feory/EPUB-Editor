import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import JSZip from 'jszip';
import { importEpub, type ImportEpubApi } from './import-epub';

beforeAll(() => {
    const win = new Window();
    Object.assign(globalThis, { DOMParser: win.DOMParser, document: win.document, NodeFilter: win.NodeFilter });
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

async function makeEpub() {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    zip.file('OEBPS/image/capa.jpg', JPEG);
    const page = (body: string) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>T</title></head><body>${body}</body></html>`;
    zip.file('OEBPS/cover.xhtml', page('<img src="image/capa.jpg" alt=""/>'));
    zip.file('OEBPS/c1.xhtml', page('<h1>Um</h1><p>texto</p>'));
    zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Livro_ebook</dc:title><dc:creator>Autor</dc:creator><dc:identifier>9789720000000</dc:identifier><meta property="pageBreakSource">urn:isbn: 9789720000001</meta><meta name="cover" content="capa"/></metadata>
<manifest><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="capa" href="image/capa.jpg" media-type="image/jpeg"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="cover" linear="no"/><itemref idref="c1"/></spine></package>`);
    return new File([await zip.generateAsync({ type: 'arraybuffer' })], 'livro.epub');
}

// API falsa em memória: regista as chamadas pela ordem
function fakeApi() {
    const calls: [string, ...unknown[]][] = [];
    const rec = (name: string) => async (...args: unknown[]) => { calls.push([name, ...args]); return {} as never; };
    const api = {
        create: rec('create'), uploadCover: rec('uploadCover'), uploadImages: rec('uploadImages'),
        saveContent: rec('saveContent'), updateMetadata: rec('updateMetadata'),
    } as unknown as ImportEpubApi;
    return { api, calls };
}

test('importEpub cria o ebook com os metadados do OPF, envia a capa, o conteúdo e devolve o ISBN', async () => {
    const { api, calls } = fakeApi();
    const isbn = await importEpub(await makeEpub(), undefined, api);
    expect(isbn).toBe('9789720000000');
    expect(calls.map(c => c[0])).toEqual(['create', 'uploadCover', 'saveContent', 'updateMetadata']);
    expect(calls[0][1]).toEqual({ ebook_isbn: '9789720000000', physical_isbn: '9789720000001', title: 'Livro', author: 'Autor' });
    expect(calls[3][2]).toMatchObject({ title: 'Livro', author: 'Autor', physical_isbn: '9789720000001' });
});

test('importEpub: falha da capa não bloqueia; erro da API (ex. 409) propaga', async () => {
    const { api, calls } = fakeApi();
    api.uploadCover = async () => { throw new Error('413'); };
    await importEpub(await makeEpub(), undefined, api);
    expect(calls.map(c => c[0])).toEqual(['create', 'saveContent', 'updateMetadata']);

    api.create = async () => { throw Object.assign(new Error('409'), { response: { status: 409 } }); };
    await expect(importEpub(await makeEpub(), undefined, api)).rejects.toThrow('409');
});
