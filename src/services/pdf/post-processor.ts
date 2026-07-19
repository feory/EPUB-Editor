/**
 * Post-processing functions for the extracted HTML
 */

export function linkFootnotes(html: string, idPrefix: string = ''): string {
  let result = html;

  const footnoteDefPattern = /<p(?: id="[^"]*")? class="footnote">(\s*(?:<a[^>]*>)?\s*<sup>(\d+|\*+)<\/sup>(?:<\/a>)?.*?)\s*<\/p>/gs;
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
      if (context.includes('class="footnote"')) return match;
      const fn = fns[fnIndex++];
      fn.refFound = true;
      return `<sup id="${fn.refId}"><a epub:type="noteref" role="doc-noteref" href="#${fn.fnId}">${marker}</a></sup>`;
    });
  });

  // Convert <p class="footnote"> → <aside>; backlink only when body ref was matched
  footnoteDefs.forEach(fn => {
    const contentWithoutMarker = fn.innerContent
      .replace(/^\s*(?:<a[^>]*>)?\s*<sup>(?:\d+|\*+)<\/sup>\s*(?:<\/a>)?\s*/, '')
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

export function consolidateSplitFootnotes(html: string): string {
  const footnoteWithoutNumber = /<p class="footnote">(?!<sup>)(.+?)<\/p>/g;
  let result = html;
  let match;

  while ((match = footnoteWithoutNumber.exec(result)) !== null) {
    const footnoteContent = match[1];
    const footnoteFullMatch = match[0];
    const footnoteIndex = match.index;
    const beforeContent = result.substring(0, footnoteIndex);

    const footnotesWithNumbers = Array.from(
      beforeContent.matchAll(/<p class="footnote"><sup>(\d+|\*+)<\/sup>(.+?)<\/p>/g)
    );

    if (footnotesWithNumbers.length > 0) {
      const lastNumberedFootnote = footnotesWithNumbers[footnotesWithNumbers.length - 1];
      const lastFootnoteIndex = lastNumberedFootnote.index!;
      const marker = lastNumberedFootnote[1];
      const content = lastNumberedFootnote[2];
      const lastFootnoteFullMatch = lastNumberedFootnote[0];

      const mergedFootnote = `<p class="footnote"><sup>${marker}</sup>${content} ${footnoteContent.trim()}</p>`;
      result = result.substring(0, lastFootnoteIndex) +
        mergedFootnote +
        result.substring(lastFootnoteIndex + lastFootnoteFullMatch.length);

      const lengthDiff = mergedFootnote.length - lastFootnoteFullMatch.length;
      const newFootnoteIndex = footnoteIndex + lengthDiff;
      result = result.substring(0, newFootnoteIndex) +
        result.substring(newFootnoteIndex + footnoteFullMatch.length);
      footnoteWithoutNumber.lastIndex = lastFootnoteIndex;
    }
  }

  return result;
}

export function consolidateSplitParagraphs(html: string): string {
  // Aceita <p> com atributos (exceto footnote) — parágrafos com classes do import
  // (p-indent, etc.) contam como fragmento e como alvo, senão a fusão salta-os
  // e a continuação vai parar a parágrafos distantes
  // « (aspa de abertura): início de citação partido do parágrafo anterior por
  // quebra de página PDF→Word — tratado como fragmento (o guard de fusão na
  // l.155 só funde se o anterior ficou a meio de palavra, evita diálogos legítimos)
  const paragraphStartingWithLowercase = /<p(?![^>]*class="[^"]*footnote")[^>]*>(\s*(?:<[^>]+>)*\s*)([a-zà-ÿ«-])/g;
  let result = html;
  let match;

  while ((match = paragraphStartingWithLowercase.exec(result)) !== null) {
    const paragraphIndex = match.index;
    const restOfHtml = result.substring(paragraphIndex);
    const paragraphEnd = restOfHtml.indexOf('</p>');
    if (paragraphEnd === -1) continue;

    const fullParagraph = restOfHtml.substring(0, paragraphEnd + 4);
    const paragraphContent = fullParagraph.substring(fullParagraph.indexOf('>') + 1, fullParagraph.length - 4);

    const listItemPattern = /^\s*(?:<[^>]+>)*\s*([a-z]|[ivxlcdm]+|\d+)[.)]\s/i;
    if (listItemPattern.test(paragraphContent)) continue;

    // Último <p> NÃO-footnote e NÃO-vazio que fecha antes de paragraphIndex.
    // Pesquisa para trás (O(1) amortizado) em vez de copiar o prefixo + matchAll
    // de TODOS os <p> anteriores (era O(n) por fusão → O(n²) no total).
    let lastParagraphIndex = -1;
    let lastParagraphFullMatch = '';
    let lastParagraphContent = '';
    let close = result.lastIndexOf('</p>', paragraphIndex);
    while (close !== -1) {
      // Tag <p ...> que abre este </p> (saltar <pre>/<param> — char a seguir a "<p")
      let open = result.lastIndexOf('<p', close);
      while (open !== -1) {
        const after = result[open + 2];
        if (after === '>' || after === ' ' || after === '\t' || after === '\n' || after === '\r') break;
        open = result.lastIndexOf('<p', open - 1);
      }
      if (open === -1) break;
      const full = result.substring(open, close + 4);
      const openTagEnd = full.indexOf('>');
      const openTag = full.substring(0, openTagEnd + 1);
      const content = full.substring(openTagEnd + 1, full.length - 4);
      // Paridade com o regex (.+?): footnote excluída e conteúdo ≥1 char (salta <p></p>)
      if (!/class="[^"]*footnote/.test(openTag) && content.length > 0) {
        lastParagraphIndex = open;
        lastParagraphFullMatch = full;
        lastParagraphContent = content.trim();
        break;
      }
      close = result.lastIndexOf('</p>', open - 1);
    }

    if (lastParagraphIndex !== -1) {
      // Só fundir se o parágrafo anterior ficou a MEIO de palavra (quebra real de
      // página): última letra minúscula ou hífen. Entradas completas (índice
      // remissivo, etc.) terminam em nº de página, pontuação ou acrónimo MAIÚSCULO
      // — nesses casos o parágrafo seguinte é legítimo e NÃO deve ser fundido.
      const lastText = lastParagraphContent.replace(/<[^>]+>/g, '').trim();
      if (!/[a-zà-ÿ-]$/.test(lastText)) continue;

      let mergedContent = '';
      const nextContent = paragraphContent.trim();

      if (lastParagraphContent.endsWith('-') && nextContent.startsWith('-')) {
        mergedContent = lastParagraphFullMatch.replace(/-<\/p>$/, nextContent + '</p>');
      } else {
        mergedContent = lastParagraphFullMatch.replace(/<\/p>$/, ' ' + nextContent + '</p>');
      }

      result = result.substring(0, lastParagraphIndex) +
        mergedContent +
        result.substring(lastParagraphIndex + lastParagraphFullMatch.length);

      const lengthDiff = mergedContent.length - lastParagraphFullMatch.length;
      const newParagraphIndex = paragraphIndex + lengthDiff;
      result = result.substring(0, newParagraphIndex) +
        result.substring(newParagraphIndex + fullParagraph.length);
      paragraphStartingWithLowercase.lastIndex = lastParagraphIndex;
    }
  }

  return result;
}

export function finalCleanup(html: string): string {
  return html.replace(/([a-zA-ZÀ-ÿ])-\s+([a-zà-ÿ])/g, '$1$2');
}

/**
 * Converte números no início de notas de rodapé para <sup>
 * Ex: <p class="footnote">12 Texto...</p> → <p class="footnote"><sup>12</sup> Texto...</p>
 */
export function fixFootnoteNumbers(html: string): string {
  // Encontrar notas que começam com número sem <sup>
  return html.replace(
    /<p([^>]*class="[^"]*footnote[^"]*"[^>]*)>(\s*)(\d{1,3})(\s+)/g,
    '<p$1>$2<sup>$3</sup>$4'
  );
}

/**
 * Consolida notas de rodapé divididas em múltiplos parágrafos
 */
export function consolidateFootnoteContinuations(html: string): string {
  let result = html;
  let changed = true;

  while (changed) {
    changed = false;

    // Padrão: nota com número seguida de nota sem número (continuação)
    // <p class="footnote"><sup>X</sup>...</p> seguido de <p class="footnote">texto sem número...</p>
    const pattern = /(<p[^>]*class="[^"]*footnote[^"]*"[^>]*><sup>(\d+|\*+)<\/sup>(.+?)<\/p>)\s*(<p[^>]*class="[^"]*footnote[^"]*"[^>]*>(?!<sup>)(.+?)<\/p>)/gs;

    const match = pattern.exec(result);
    if (match) {
      const fullMatch = match[0];
      const marker = match[2];
      const firstContent = match[3];
      const secondContent = match[5];

      // Verificar se a segunda parte não começa com número (seria nova nota)
      if (!/^\s*\d{1,3}\s/.test(secondContent)) {
        const merged = `<p class="footnote"><sup>${marker}</sup>${firstContent} ${secondContent.trim()}</p>`;
        result = result.replace(fullMatch, merged);
        changed = true;
      }
    }
  }

  return result;
}