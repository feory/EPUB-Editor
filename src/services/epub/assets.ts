import { prepareTextForXml, escapeXml } from './html-utils';
import type { Section } from './types';
import type { BookMetadata } from './types';

export interface CoverAssets {
    xhtmlItem: string;
    imageItem: string;
    spineItem: string;
    meta: string;
}

export const generateNavXhtml = (sections: Section[], pageEntries: { section: number; page: number }[] = []): string => {
    const pageListNav = pageEntries.length === 0 ? '' : `
  <nav epub:type="page-list" id="page-list" role="doc-pagelist">
    <h1>Lista de Páginas</h1>
    <ol>
      ${pageEntries.map(e => `<li><a href="section${e.section}.xhtml#page-${e.page}">${e.page}</a></li>`).join('\n      ')}
    </ol>
  </nav>`;
    const navItems = sections
        .map((sec, i) => {
            if (sec.parentIdx !== -1) return null;
            if (sec.hiddenFromToc) return null;

            let html = `<li><a href="section${i + 1}.xhtml">${prepareTextForXml(sec.title)}</a>`;
            const visibleChildren = sec.childIndices.filter(cidx => !sections[cidx].hiddenFromToc);
            if (visibleChildren.length > 0) {
                html += `\n        <ol>\n          ` +
                    visibleChildren
                        .map(cidx => `<li><a href="section${cidx + 1}.xhtml">${prepareTextForXml(sections[cidx].title)}</a></li>`)
                        .join('\n          ') +
                    `\n        </ol>`;
            }
            html += `</li>`;
            return html;
        })
        .filter(Boolean)
        .join('\n      ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt" xml:lang="pt">
<head>
  <title>Índice</title>
  <meta charset="utf-8" />
  <style>
    nav ol { list-style-type: none; padding-left: 0; }
    nav ol ol { padding-left: 1.5em; }
  </style>
</head>
<body>
  <nav epub:type="toc" id="toc" role="doc-toc">
    <h1>Índice</h1>
    <ol>
      ${navItems}${pageEntries.length > 0 ? '\n      <li><a href="pagelist.xhtml">Lista de Páginas</a></li>' : ''}
    </ol>
  </nav>${pageListNav}
</body>
</html>`;
};

// Página de conteúdo dedicada (entra no spine como página própria "Lista de Páginas").
// Usa lista simples de links (sem epub:type="page-list" — esse é o do nav.xhtml, canónico).
export const generatePageListXhtml = (pageEntries: { section: number; page: number }[]): string => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt" xml:lang="pt">
<head>
  <title>Lista de Páginas</title>
  <meta charset="utf-8" />
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
  <section aria-label="Lista de Páginas">
    <h1>Lista de Páginas</h1>
    <ol>
      ${pageEntries.map(e => `<li><a href="section${e.section}.xhtml#page-${e.page}">${e.page}</a></li>`).join('\n      ')}
    </ol>
  </section>
</body>
</html>`;
};

export const generateContentOpf = (
    sections: Section[],
    metadata: BookMetadata,
    uniqueId: string,
    imageManifestItems: string,
    fontManifestItems: string,
    cover: CoverAssets,
    hasPageList = false,
): string => {
    const manifestItems = sections
        .map((_, i) => `<item id="section${i + 1}" href="section${i + 1}.xhtml" media-type="application/xhtml+xml"/>`)
        .join('\n    ');
    const spineItems = sections.map((_, i) => `<itemref idref="section${i + 1}"/>`).join('\n    ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0" xml:lang="${metadata.language || 'pt'}" prefix="schema: http://schema.org/">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:creator>${escapeXml(metadata.author)}</dc:creator>
    <dc:identifier id="BookId">urn:uuid:${uniqueId}</dc:identifier>
    ${metadata.ebook_isbn ? `<dc:identifier id="isbn-id">${escapeXml(metadata.ebook_isbn)}</dc:identifier>` : ''}
    <dc:language>${metadata.language || 'pt'}</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
    ${metadata.description ? `<dc:description>${escapeXml(metadata.description)}</dc:description>` : ''}
    ${metadata.publisher ? `<dc:publisher>${escapeXml(metadata.publisher)}</dc:publisher>` : ''}
    ${metadata.pub_date ? `<dc:date>${metadata.pub_date}</dc:date>` : ''}
    ${metadata.subjects ? metadata.subjects.split(',').map(s => `<dc:subject>${escapeXml(s.trim())}</dc:subject>`).join('\n    ') : ''}
    ${(metadata.physical_isbn || hasPageList) ? `<dc:source id="src-id">${escapeXml(metadata.physical_isbn || 'Edição impressa')}</dc:source>` : ''}
    ${cover.meta}

    <!-- Metadados de Acessibilidade -->
    <meta property="dcterms:conformsTo">EPUB Accessibility 1.1 - WCAG 2.0 Level AA</meta>
    <meta property="schema:accessibilitySummary">Esta publicação cumpre os requisitos WCAG 2.0 Nível AA.</meta>
    <meta property="schema:accessMode">textual</meta>
    <meta property="schema:accessMode">visual</meta>
    <meta property="schema:accessibilityHazard">none</meta>
    <meta property="schema:accessibilityFeature">structuralNavigation</meta>
    <meta property="schema:accessibilityFeature">tableOfContents</meta>
    ${hasPageList ? '<meta property="schema:accessibilityFeature">printPageNumbers</meta>\n    <meta property="schema:accessibilityFeature">pageNavigation</meta>' : ''}
    <meta property="schema:accessibilityFeature">readingOrder</meta>
    <meta property="schema:accessibilityFeature">alternativeText</meta>
    <meta property="schema:accessModeSufficient">textual,visual</meta>
    <meta property="schema:accessModeSufficient">textual</meta>
    ${(metadata.physical_isbn || hasPageList) ? `<meta property="schema:pageBreakSource" refines="#src-id">${escapeXml(metadata.physical_isbn || 'Edição impressa')}</meta>` : ''}
  </metadata>
  <manifest>
    ${cover.xhtmlItem}
    ${cover.imageItem}
    ${manifestItems}
    ${imageManifestItems}
    ${fontManifestItems}
    ${hasPageList ? '<item id="pagelist" href="pagelist.xhtml" media-type="application/xhtml+xml"/>' : ''}
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    ${cover.spineItem}
    ${spineItems}
    ${hasPageList ? '<itemref idref="pagelist"/>' : ''}
    <itemref idref="nav" linear="yes"/>
  </spine>
</package>`;
};

export const generateTocNcx = (sections: Section[], uniqueId: string, title: string, hasPageList = false): string => {
    let playOrder = 1;
    const navPointsList: string[] = [];

    sections.forEach((sec, i) => {
        if (sec.parentIdx !== -1) return;
        if (sec.hiddenFromToc) return;

        let html = `
    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>${prepareTextForXml(sec.title)}</text></navLabel>
      <content src="section${i + 1}.xhtml"/>`;

        sec.childIndices.filter(cidx => !sections[cidx].hiddenFromToc).forEach(cidx => {
            playOrder++;
            html += `
      <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
        <navLabel><text>${prepareTextForXml(sections[cidx].title)}</text></navLabel>
        <content src="section${cidx + 1}.xhtml"/>
      </navPoint>`;
        });

        playOrder++;
        html += `\n    </navPoint>`;
        navPointsList.push(html);
    });

    if (hasPageList) {
        navPointsList.push(`
    <navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>Lista de Páginas</text></navLabel>
      <content src="pagelist.xhtml"/>
    </navPoint>`);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${uniqueId}"/>
    <meta name="dtb:depth" content="2"/>
  </head>
  <docTitle><text>${prepareTextForXml(title)}</text></docTitle>
  <navMap>
    ${navPointsList.join('')}
  </navMap>
</ncx>`;
};
