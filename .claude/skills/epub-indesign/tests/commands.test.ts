// Testes de livro inteiro: EPUBs mínimos "à InDesign" construídos em memória → convertBook / verifyBook.
// Correr: bun test ./.claude/skills/epub-indesign/tests/  (com ./ — o bun ignora pastas com ponto num filtro)
import { test, expect } from 'bun:test';
import JSZip from 'jszip';
import { parseXml } from '../book';
import { convertBook, verifyBook, type BookMap } from '../commands';

type Doc = { href: string; title: string; body: string };

const CSS = `
p.TXT { text-align: justify; text-indent: 1.2em; font-size: 1em; }
p.ABERTURA { text-align: center; font-size: 3em; }
p.NOTAS { font-size: 0.75em; }
span.Subido { vertical-align: super; }`;

const MAP: BookMap = {
    extras: '',
    classes: {
        'p.TXT': { target: '' }, 'p.ABERTURA': { target: 'h1' }, 'p.NOTAS': { target: '' }, 'span.Subido': { target: 'sup' },
    },
};

// EPUB mínimo como o InDesign exporta: OPF + CSS próprio + documentos .xhtml (+ nav opcional, fora do conteúdo)
async function makeEpub(documents: Doc[], nav = ''): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    zip.file('OEBPS/css/idGeneratedStyles.css', CSS);
    const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-PT"><head><title>${title}</title><link href="css/idGeneratedStyles.css" rel="stylesheet" type="text/css"/></head><body>${body}</body></html>`;
    documents.forEach(d => zip.file(`OEBPS/${d.href}`, xhtml(d.title, d.body)));
    if (nav) zip.file('OEBPS/toc.xhtml', xhtml('Conteúdo', `<nav epub:type="toc">${nav}</nav>`));
    zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest>
${documents.map((d, i) => `<item id="d${i}" href="${d.href}" media-type="application/xhtml+xml"/>`).join('\n')}
${nav ? '<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ''}
<item id="css" href="css/idGeneratedStyles.css" media-type="text/css"/>
</manifest><spine>${documents.map((_, i) => `<itemref idref="d${i}"/>`).join('')}</spine></package>`);
    return zip.generateAsync({ type: 'uint8array' });
}

async function readDoc(bytes: Uint8Array, href: string) {
    const zip = await JSZip.loadAsync(bytes);
    return parseXml(await zip.file(`OEBPS/${href}`)!.async('text'));
}
// CSS do editor mínimo (o real é o DEFAULT_CSS da app, passado pela CLI)
const EDITOR_CSS = `p { text-align: justify; text-indent: 0; margin: 0; }
.p-indent { text-indent: 2.15em !important; }
.p-top { margin-top: 30px !important; }
.p-center { text-align: center !important; text-indent: 0 !important; }`;
const convert = (bytes: Uint8Array) => convertBook(bytes, MAP, EDITOR_CSS);

test('notas: chamada em <sup><a noteref>, nota com vários parágrafos inteira e quebra de página lá dentro', async () => {
    const epub = await makeEpub([{ href: 'c1.xhtml', title: 'Um', body:
        '<p class="TXT">texto<span class="Subido"><a class="_idFootnoteLink" id="fn1-back" href="#fn1" epub:type="noteref">1</a></span> mais</p>' +
        '<section class="_idFootnotes"><ol class="_listStyleNone"><li class="_idFootnote" id="fn1">' +
        '<p class="NOTAS"><a class="_idFootnoteAnchor" href="#fn1-back">1</a> primeiro</p>' +
        '<div id="page9" role="doc-pagebreak" aria-label="9" epub:type="pagebreak"></div>' +
        '<p class="NOTAS">segundo</p></li></ol></section>' }]);
    const { bytes, report } = await convert(epub);
    const doc = await readDoc(bytes, 'c1.xhtml');
    expect(report.notes).toBe(1);
    expect(doc.querySelector('sup > a[role="doc-noteref"]')?.textContent).toBe('1');
    const aside = doc.querySelector('div.footnotes-section > aside.footnote')!;
    expect(aside.getAttribute('id')).toBe('fn1');
    expect(Array.from(aside.querySelectorAll('p')).map(p => p.textContent?.trim())).toEqual(['1 primeiro', 'segundo']);
    expect(aside.querySelectorAll('p')[1].firstElementChild?.getAttribute('aria-label')).toBe('9'); // quebra no início do 2.º parágrafo
});

test('quebra de página em <div> entre parágrafos → <span> vazio no início do parágrafo seguinte', async () => {
    const epub = await makeEpub([{ href: 'c1.xhtml', title: 'Um', body:
        '<p class="TXT">antes</p><div id="page5" role="doc-pagebreak" aria-label="5" epub:type="pagebreak"></div><p class="TXT">depois</p>' }]);
    const doc = await readDoc((await convert(epub)).bytes, 'c1.xhtml');
    const pb = doc.querySelector('[role="doc-pagebreak"]')!;
    expect(pb.localName).toBe('span');
    expect(pb.parentElement?.textContent).toBe('depois');
    expect(pb.childNodes.length).toBe(0);
});

test('antes do Índice: Rosto e Ficha Técnica; títulos do rosto não criam capítulo', async () => {
    const epub = await makeEpub([
        { href: 'rosto.xhtml', title: 'Título original:', body: '<p class="ABERTURA">O Livro</p><img src="r.png" alt=""/>' },
        { href: 'ficha.xhtml', title: 'ficha', body: '<p class="TXT">© 2026 Editora · ISBN 978</p>' },
        { href: 'ind.xhtml', title: 'Índice', body: '<p class="TXT">Índice</p>' },
        { href: 'cap.xhtml', title: 'Capítulo 1', body: '<p class="ABERTURA">Capítulo 1</p><p class="TXT">texto</p>' },
    ]);
    const { bytes } = await convert(epub);
    const rosto = await readDoc(bytes, 'rosto.xhtml');
    expect(rosto.querySelector('title')?.textContent).toBe('Rosto');
    expect(rosto.querySelector('h1')).toBeNull();
    expect((await readDoc(bytes, 'ficha.xhtml')).querySelector('title')?.textContent).toBe('Ficha Técnica');
    expect((await readDoc(bytes, 'cap.xhtml')).querySelector('h1')?.textContent).toBe('Capítulo 1');
});

test('<h1> seguidos fundem-se num só (A<br/>B)', async () => {
    const epub = await makeEpub([{ href: 'c1.xhtml', title: 'Dois', body:
        '<p class="ABERTURA">Capítulo 2</p><p class="ABERTURA">O Título</p><p class="TXT">texto</p>' }]);
    const doc = await readDoc((await convert(epub)).bytes, 'c1.xhtml');
    const h1s = doc.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].querySelector('br')).not.toBeNull();
    expect(h1s[0].textContent).toBe('Capítulo 2O Título');
});

test('parágrafo vazio (espaço à mão) sai e o seguinte ganha p-top', async () => {
    const epub = await makeEpub([{ href: 'c1.xhtml', title: 'Um', body: '<p class="TXT">a</p><p class="TXT"></p><p class="TXT">depois</p>' }]);
    const doc = await readDoc((await convert(epub)).bytes, 'c1.xhtml');
    expect(Array.from(doc.querySelectorAll('p')).map(p => p.getAttribute('class'))).toEqual(['p-indent', 'p-indent p-top']);
});

test('contentor com id referenciado no nav: o contentor sai, o id passa para dentro', async () => {
    const epub = await makeEpub(
        [{ href: 'c1.xhtml', title: 'Um', body: '<div id="box1" class="Quadro"><p class="TXT">dentro</p></div>' }],
        '<ol><li><a href="c1.xhtml#box1">Um</a></li></ol>');
    const doc = await readDoc((await convert(epub)).bytes, 'c1.xhtml');
    expect(doc.querySelector('div')).toBeNull();
    expect(doc.querySelector('#box1')?.textContent).toBe('dentro');
});

test('verify: original × optimizado limpo; e apanha texto perdido', async () => {
    const epub = await makeEpub([{ href: 'c1.xhtml', title: 'Um', body:
        '<p class="TXT">primeiro parágrafo</p><p class="TXT">segundo parágrafo</p>' }]);
    const { bytes } = await convert(epub);
    const ok = await verifyBook(epub, bytes);
    expect(ok.text.ok).toBe(true);
    expect(ok.diffs).toEqual([]);
    expect(ok.foreignClasses).toEqual([]);

    // estragar o optimizado de propósito: perder uma palavra
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('OEBPS/c1.xhtml')!.async('text');
    zip.file('OEBPS/c1.xhtml', xml.replace('segundo parágrafo', 'segundo'));
    const bad = await verifyBook(epub, await zip.generateAsync({ type: 'uint8array' }));
    expect(bad.text.ok).toBe(false);
});
