import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { saveAs } from 'file-saver';
import { ebooksApi } from '../api/ebooks-api';
import { linkFootnotes } from './pdf/post-processor';
import { cleanHtmlForXhtml } from './epub/html-utils';
import { removeInaccessibleColors, removeInaccessibleCssColors } from './epub/color-utils';
import { replaceImageUrlsInContent, addImagesToArchive } from './epub/image-utils';
import { buildSections } from './epub/chapters';
import { generateNavXhtml, generatePageListXhtml, generateContentOpf, generateTocNcx, type CoverAssets } from './epub/assets';
import { convertPageBreaks } from './page-list';
import { prepareTextForXml } from './epub/html-utils';

export type { BookMetadata } from './epub/types';
import type { BookMetadata } from './epub/types';

// Mantido para compatibilidade - usar DEFAULT_CSS do StyleContext para customização
export const EPUB_CSS = `
    /* === TIPOGRAFIA === */
    @font-face {
        font-family: "Crimson Text";
        src: url("Fonts/CrimsonText-Regular.ttf");
        font-weight: normal;
        font-style: normal;
    }
    @font-face {
        font-family: "Crimson Text";
        src: url("Fonts/CrimsonText-Italic.ttf");
        font-weight: normal;
        font-style: italic;
    }
    @font-face {
        font-family: "Crimson Text";
        src: url("Fonts/CrimsonText-Bold.ttf");
        font-weight: bold;
        font-style: normal;
    }
    @font-face {
        font-family: "Crimson Text";
        src: url("Fonts/CrimsonText-BoldItalic.ttf");
        font-weight: bold;
        font-style: italic;
    }

    /* === ESTRUTURA BASE === */
    body {
        font-family: "Crimson Text", "DejaVu Serif", Georgia, serif;
        margin: 5%;
        line-height: 1.5;
        color: #1a1a1a;
        background-color: #fff;
        font-size: 1.1em;
    }

    h1 { text-align: center; margin-top: 2em; font-size: 1.8em; line-height: 1.2; }
    h2 { text-align: center; margin-top: 1.5em; margin-bottom: 1.5em; font-weight: normal; font-style: italic; color: #444; }

    img {
        max-width: 100%;
        height: auto;
        margin: 1.5em auto;
        display: block;
    }

    img.img-center { display: block; float: none; margin: 1.5em auto; }
    img.img-left { float: left; margin: 0.5em 1.5em 0.5em 0; }
    img.img-right { float: right; margin: 0.5em 0 0.5em 1.5em; }

    sup {
        font-size: 0.75em;
        vertical-align: super;
        line-height: 0;
    }
    sup a { text-decoration: none; color: inherit; }

    .small-caps { font-variant: small-caps; }

    /* === PARÁGRAFOS === */
    p {
        margin-bottom: 0;
        margin-top: 0;
        text-indent: 0;
        text-align: justify;
        hyphens: auto;
        -webkit-hyphens: auto;
        -moz-hyphens: auto;
        adobe-hyphenate: explicit;
    }

    /* Listas (bullets) — espaçamento entre itens */
    ul, ol { margin: 0.5em 0; padding-left: 1.5em; }
    li { margin-bottom: 0.5em; text-align: justify; }

    /* === ESTILOS DE PARÁGRAFO === */
    .p-non-indent  { text-indent: 0 !important; }
    .p-indent      { text-indent: 1.5em !important; }
    .p-top         { text-indent: 0 !important; margin-top: 30px !important; }
    .p-center      { text-align: center !important; text-indent: 0 !important; }
    .p-space       { margin-top: 100px !important; }
    .p-small       { font-size: 0.85em !important; }
    .p-legendas    { font-size: 0.85em !important; margin-bottom: 30px !important; text-indent: 0 !important; }
    table          { border-collapse: collapse; margin: 1em 0; font-size: 0.85em; width: 100%; table-layout: fixed; }
    table th, table td { border: 1px solid #333; padding: 4px 8px; text-align: center; vertical-align: middle; word-wrap: break-word; overflow-wrap: break-word; }
    table th       { font-weight: bold; }
    .p-quote       { margin-left: 2em !important; margin-right: 2em !important; font-size: 0.85em !important; }
    .p-bold        { font-weight: bold !important; }
    .p-italic      { font-style: italic !important; }
    .p-bold-italic { font-weight: bold !important; font-style: italic !important; }
    .p-asterisk    { text-align: center !important; text-indent: 0 !important; font-style: italic; font-size: 1.3em; margin: 1.5em 0 !important; }

    /* === BORDAS === */
    .p-border-top    { border-top: 2px solid #555; padding-top: 0.6em; margin-top: 0.6em; text-indent: 0 !important; }
    .p-border-bottom { border-bottom: 2px solid #555; padding-bottom: 0.6em; margin-bottom: 0.6em; text-indent: 0 !important; }
    .p-border-sides  { border-left: 2px solid #333; border-right: 2px solid #888; padding-left: 0.6em; padding-right: 0.6em; text-indent: 0 !important; }

    /* === CAPITULAR === */
    span.drop-cap { float: left; font-size: 2.5em; line-height: 0.75; margin: 0.05em 0.08em 0 0; font-weight: bold; }
    p.drop-cap { text-indent: 0 !important; }
    p.drop-cap::first-letter { float: left; font-size: 2.5em; line-height: 0.75; margin: 0.05em 0.08em 0 0; font-weight: bold; }

    /* === NOTAS DE RODAPÉ === */
    .footnote {
        font-size: 0.9em;
        text-indent: 0;
        margin-top: 0.6em;
        color: #333;
        text-align: left;
        display: block;
        hyphens: none;
    }
    .footnote p { text-indent: 0 !important; margin: 0; }
    .footnote a { text-decoration: none; color: inherit; }

    hr.footnote-sep {
        margin: 2em 0 1em 0;
        border: none;
        border-top: 1px solid #ccc;
        width: 40%;
    }
`;

// O style.css por livro tem uma secção editor-only após este marcador; cortar antes de exportar/pré-visualizar.
const EDITOR_CSS_MARKER = '/* === EDITOR (não exportado para EPUB) === */';
const stripEditorOnlyCss = (css: string): string => {
    const i = css.indexOf(EDITOR_CSS_MARKER);
    return i === -1 ? css : css.slice(0, i).trimEnd();
};

// CSS de exportação: corta a secção editor-only e garante classes utilitárias recentes
// que podem faltar no style.css de livros antigos (ex.: versaletes, p-italic).
const exportCss = (css: string): string => {
    let out = stripEditorOnlyCss(css);
    if (!out.includes('.small-caps')) {
        out += '\n.small-caps { font-variant: small-caps; }';
    }
    if (!out.includes('.p-italic')) {
        out += '\n.p-bold { font-weight: bold !important; }\n.p-italic { font-style: italic !important; }\n.p-bold-italic { font-weight: bold !important; font-style: italic !important; }';
    }
    if (!out.includes('.p-asterisk')) {
        out += '\n.p-asterisk { text-align: center !important; text-indent: 0 !important; font-style: italic; font-size: 1.3em; margin: 1.5em 0 !important; }';
    }
    // Notas: marcador (sup a) e backlink (.footnote a) herdam a cor do texto.
    // SEMPRE anexado no fim (vence a cascata) — livros antigos podem ter
    // `.footnote a { text-decoration: none }` SEM `color`, deixando o link na
    // cor azul default do browser (#0000ee) que falha o contraste/distinguibilidade
    // do ACE (link-in-text-block). Anexar (em vez de um guard por presença)
    // garante o `color: inherit` independentemente do css por livro.
    out += '\nsup a, .footnote a { text-decoration: none !important; color: inherit !important; }';
    // Marcador da nota (e backlink, já em <sup>) elevado — livros antigos podem
    // não ter a regra `sup` no style.css por livro, exportando o número em
    // tamanho normal (sem superscript). Anexar incondicional garante a elevação.
    out += '\nsup { vertical-align: super !important; font-size: 0.75em !important; line-height: 0 !important; }';
    return out;
};

export const generateEpubBlob = async (htmlContent: string, metadata: BookMetadata, customCss?: string): Promise<Blob> => {
    const zip = new JSZip();
    const uniqueId = uuidv4();

    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    const cleanedContent = cleanHtmlForXhtml(htmlContent);
    const accessibleContent = removeInaccessibleColors(cleanedContent);

    let processedContent = accessibleContent;
    if (metadata.images && metadata.images.size > 0) {
        processedContent = replaceImageUrlsInContent(processedContent, metadata.images);
    }

    const sections = buildSections(processedContent);

    zip.folder('META-INF')?.file('container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
   <rootfiles>
      <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
   </rootfiles>
</container>`);

    const oebps = zip.folder('OEBPS');
    if (!oebps) throw new Error('Failed to create OEBPS folder');


    let imageManifestItems = '';
    if (metadata.images && metadata.images.size > 0) {
        const imagesFolder = oebps.folder('Images');
        if (!imagesFolder) throw new Error('Failed to create Images folder');
        const { manifestItems } = addImagesToArchive(metadata.images, imagesFolder);
        imageManifestItems = manifestItems;
    }

    const cover: CoverAssets = { xhtmlItem: '', imageItem: '', spineItem: '', meta: '' };
    if (metadata.cover) {
        oebps.file('cover.jpg', metadata.cover);
        oebps.file('cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt" xml:lang="pt">
<head>
  <title>Capa</title>
  <style>
    body { margin: 0; padding: 0; text-align: center; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div style="text-align: center; padding: 0pt; margin: 0pt;">
    <img src="cover.jpg" alt="Capa" />
  </div>
</body>
</html>`);
        cover.imageItem = '<item id="cover-image" href="cover.jpg" media-type="image/jpeg" properties="cover-image"/>';
        cover.xhtmlItem = '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>';
        cover.spineItem = '<itemref idref="cover" linear="yes"/>';
        cover.meta = '<meta name="cover" content="cover-image" />';
    }

    const stripFontFaces = (css: string) => css.replace(/@font-face\s*\{[^}]*\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
    oebps.file('style.css', stripFontFaces(removeInaccessibleCssColors(exportCss(customCss || EPUB_CSS))));

    const pageEntries: { section: number; page: number }[] = [];
    sections.forEach((section, i) => {
        const sectionLinked = linkFootnotes(section.content, `s${i + 1}-`);

        const asideBlocks: string[] = [];
        const mainContent = convertPageBreaks(sectionLinked.replace(
            /<div class="footnotes-section">([\s\S]*?)<\/div>/g,
            (_, inner) => { asideBlocks.push(inner.trim()); return ''; },
        ).trim(), i + 1, pageEntries);
        const hasFootnotes = asideBlocks.length > 0 && asideBlocks.some(b => b.trim().length > 0);

        oebps.file(`section${i + 1}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt" xml:lang="pt">
<head>
  <title>${prepareTextForXml(section.title)}</title>
  <meta charset="utf-8" />
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
  <section epub:type="bodymatter">
    ${mainContent}
  </section>${hasFootnotes ? '\n  <hr class="footnote-sep" />\n  ' + asideBlocks.join('\n  ') : ''}
</body>
</html>`);
    });

    oebps.file('nav.xhtml', generateNavXhtml(sections, pageEntries));
    if (pageEntries.length > 0) oebps.file('pagelist.xhtml', generatePageListXhtml(pageEntries));
    oebps.file('content.opf', generateContentOpf(sections, metadata, uniqueId, imageManifestItems, '', cover, pageEntries.length > 0));
    oebps.file('toc.ncx', generateTocNcx(sections, uniqueId, metadata.title, pageEntries.length > 0));

    return await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
};

export const generateEpub = async (htmlContent: string, metadata: BookMetadata, existingBlob?: Blob, customCss?: string) => {
    const blob = existingBlob || await generateEpubBlob(htmlContent, metadata, customCss);

    saveAs(blob, `${metadata.title.replace(/\s+/g, '_')}.epub`);

    if (metadata.isbn) {
        await ebooksApi.uploadEpub(metadata.isbn, blob);
    }
};
