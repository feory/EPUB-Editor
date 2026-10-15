/**
 * Notas de rodapé: modelo da app ↔ EPUB semântico.
 *
 * Modelo do editor (o que todos os importadores produzem e o cleanEditorHtml deixa passar):
 *   ref no corpo:  <sup>N</sup>            definição:  <p id="footnote-N" class="footnote"><sup>N</sup> texto</p>
 * Export (linkFootnotes): ref → <sup><a epub:type="noteref" role="doc-noteref">, definição → <aside epub:type="footnote"
 * role="doc-footnote"> com backlink. É a operação inversa de reverseFootnotes (import/epub-importer.ts).
 */

// Aceita classe combinada (ex. "p-small footnote"), não só class="footnote" exato — hoisted
// (em vez de literal dentro do replace()) porque corre por cada <sup>marker</sup> do corpo.
const FOOTNOTE_CLASS_RE = /class="[^"]*\bfootnote\b[^"]*"/;

export function linkFootnotes(html: string, idPrefix: string = ''): string {
  let result = html;

  // id antes OU depois da classe (o TinyMCE normaliza a ordem, os importadores não).
  const footnoteDefPattern = /<p(?: id="[^"]*")? class="[^"]*\bfootnote\b[^"]*"(?: id="[^"]*")?>(\s*(?:<a[^>]*>)?\s*\(?\s*<sup>(\d+|\*+)<\/sup>\)?(?:<\/a>)?.*?)\s*<\/p>/gs;
  footnoteDefPattern.lastIndex = 0;
  const matches = Array.from(result.matchAll(footnoteDefPattern));
  if (matches.length === 0) return result;

  const footnoteDefs = matches.map((match, idx) => ({
    fullMatch: match[0],
    innerContent: match[1],
    marker: match[2],
    fnId: `fn-${idPrefix}${idx + 1}`,
    refId: `fnref-${idPrefix}${idx + 1}`,
    refFound: false,
  }));

  // Group by marker, maintaining insertion order within each group
  const byMarker = new Map<string, typeof footnoteDefs>();
  footnoteDefs.forEach(fn => {
    if (!byMarker.has(fn.marker)) byMarker.set(fn.marker, []);
    byMarker.get(fn.marker)!.push(fn);
  });

  // Replace body refs sequentially: Nth bare <sup>marker</sup> → Nth def with that marker
  byMarker.forEach((fns, marker) => {
    const escapedMarker = marker.replace(/\*/g, '\\*');
    const refPattern = new RegExp(`<sup>${escapedMarker}<\\/sup>(?!</a>)`, 'g');
    let fnIndex = 0;

    result = result.replace(refPattern, (match, offset) => {
      if (fnIndex >= fns.length) return match;
      const context = result.substring(Math.max(0, offset - 200), offset);
      if (FOOTNOTE_CLASS_RE.test(context)) return match;
      const fn = fns[fnIndex++];
      fn.refFound = true;
      return `<sup id="${fn.refId}"><a epub:type="noteref" role="doc-noteref" href="#${fn.fnId}">${marker}</a></sup>`;
    });
  });

  // Convert <p class="footnote"> → <aside>; backlink only when body ref was matched
  footnoteDefs.forEach(fn => {
    const contentWithoutMarker = fn.innerContent
      .replace(/^\s*(?:<a[^>]*>)?\s*\(?\s*<sup>(?:\d+|\*+)<\/sup>\)?\s*(?:<\/a>)?\s*/, '')
      .trim();
    const backlinkHtml = fn.refFound
      ? `<sup><a href="#${fn.refId}" role="doc-backlink">${fn.marker}</a></sup> `
      : `<sup>${fn.marker}</sup> `;
    const asideContent = `<p>${backlinkHtml}${contentWithoutMarker}</p>`;
    const replacement = `<aside id="${fn.fnId}" epub:type="footnote" role="doc-footnote" class="footnote">${asideContent}</aside>`;
    result = result.replace(fn.fullMatch, replacement);
  });

  return result;
}
