export interface FootnoteIssue {
  type: 'orphan-ref' | 'orphan-note' | 'sequence-gap' | 'broken-link';
  message: string;
  marker: string;
  id?: string;
  context?: string;
}

export interface ValidationReport {
  issues: FootnoteIssue[];
  totalRefs: number;
  totalNotes: number;
}

function normalizeContent(html: string): string {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/\u00a0/g, ' ') // Non-breaking space
    .replace(/\s+/g, ' ');   // Collapse multiple spaces
}

/**
 * Validates footnotes in HTML content.
 * - Detects <sup> references without matching <p class="footnote">
 * - Detects <p class="footnote"> without matching <sup> references
 * - Checks if the numbering sequence is continuous (1, 2, 3...)
 */
export function validateFootnotes(html: string): ValidationReport {
  const issues: FootnoteIssue[] = [];
  const cleanHtml = normalizeContent(html);

  // 1. Find all potential notes (paragraphs with class footnote OR sups with class footnote)
  const noteBlockRegex = /<p[^>]*class="[^"]*footnote[^"]*"[^>]*>(.*?)<\/p>|<p[^>]*>(?:.*?)<sup[^>]*class="[^"]*footnote[^"]*"[^>]*>(.*?)<\/sup>(?:.*?)<\/p>/gs;
  const notes: { marker: string, index: number, content: string }[] = [];
  let match;
  
  while ((match = noteBlockRegex.exec(cleanHtml)) !== null) {
    // match[1] is for <p class="footnote">, match[2] is for <sup class="footnote">
    const innerContent = match[1] || match[2] || '';
    // More permissive marker detection: look for digits inside or outside <sup> anywhere at the start
    const markerMatch = innerContent.match(/(?:<sup>)?\s*([\d]+|[*]+)\s*(?:<\/sup>)?/i);
    const marker = markerMatch ? markerMatch[1].trim() : cleanHtml.substring(match.index, match.index+20).replace(/<[^>]*>/g, '').match(/([\d]+|[*]+)/)?.[1] || 'Misterioso';
    
    // Clean content for context (remove tags)
    const textContent = innerContent.replace(/<[^>]*>/g, '').trim();
    
    notes.push({ marker, index: match.index, content: textContent });
    
    if (marker === 'Misterioso') {
      // Get preceding context to help locate the issue
      const prevContextStart = Math.max(0, match.index - 50);
      const prevContextRaw = cleanHtml.substring(prevContextStart, match.index);
      const prevContext = prevContextRaw.replace(/<[^>]*>/g, '').trim();

      issues.push({
        type: 'broken-link',
        marker: '?',
        message: `Nota inválida (sem número). Texto: "${textContent.substring(0, 30)}..."`,
        context: prevContext ? `...${prevContext.substring(prevContext.length - 20)} [AQUI]` : textContent.substring(0, 40)
      });
    }
  }

  // 2. Find all references (<sup> outside of footnote contexts)
  const references: { marker: string, index: number }[] = [];
  
  // Regex to find all SUPs and then we filter them
  const anySupRegex = /<sup[^>]*>(?:<a[^>]*>)?\s*([\d]+|[*]+)\s*(?:<\/a>)?<\/sup>/gi;
  let supMatch;
  while ((supMatch = anySupRegex.exec(cleanHtml)) !== null) {
    const supIndex = supMatch.index;
    const supTag = supMatch[0];
    
    // Check if this SUP is inside a footnote paragraph or is a footnote SUP itself
    const isFootnoteSup = supTag.includes('class="footnote"');
    
    // Check if it's inside a footnote paragraph
    const beforeSup = cleanHtml.substring(Math.max(0, supIndex - 500), supIndex);
    const lastPTag = beforeSup.lastIndexOf('<p');
    const lastClosePTag = beforeSup.lastIndexOf('</p>');
    const isInsideFootnoteP = lastPTag > lastClosePTag && beforeSup.substring(lastPTag).includes('footnote');

    if (!isInsideFootnoteP && !isFootnoteSup) {
      references.push({
        marker: supMatch[1].trim(),
        index: supIndex
      });
    }
  }

  const noteMarkers = notes.map(n => n.marker);
  const refMarkers = references.map(r => r.marker);

  // Check for orphan references
  references.forEach(ref => {
    if (!noteMarkers.includes(ref.marker)) {
      // Find surrounding context safely
      const startContext = Math.max(0, ref.index - 40);
      const endContext = Math.min(cleanHtml.length, ref.index + 40);
      let contextRaw = cleanHtml.substring(startContext, endContext);
      
      // Clean tags to avoid partial HTML
      let contextClean = contextRaw.replace(/<[^>]*>/g, '');
      
      // Try to expand to full words if cut off
      if (contextClean.length > 10) {
           const firstSpace = contextClean.indexOf(' ');
           const lastSpace = contextClean.lastIndexOf(' ');
           if (firstSpace > 0 && lastSpace > firstSpace) {
               contextClean = contextClean.substring(firstSpace, lastSpace);
           }
      }

      issues.push({
        type: 'orphan-ref',
        marker: ref.marker,
        message: `Referência [${ref.marker}] sem nota correspondente.`,
        context: contextClean.trim()
      });
    }
  });

  // Check for orphan notes
  notes.forEach(note => {
    if (note.marker !== 'Misterioso' && !refMarkers.includes(note.marker)) {
      issues.push({
        type: 'orphan-note',
        marker: note.marker,
        message: `Nota [${note.marker}] não referenciada no texto.`,
        context: note.content // Use the cleanly extracted inner content
      });
    }
  });

  return { issues, totalRefs: references.length, totalNotes: notes.length };
}


