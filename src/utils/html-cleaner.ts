/**
 * Centralized HTML cleaning utilities with pre-compiled regex patterns
 * for optimal performance across the application
 */

import { decodeEntities } from './entities';

// ---------------------------------------------------------------------------
// Chapter structure patterns (shared with useEbookWork and content.worker)
// ---------------------------------------------------------------------------

// A chapter break is a standalone MARKER paragraph placed BEFORE each heading
// (<p class="chapter-break-h1|-h2" data-title="…">) — the marker, not the heading,
// is the split boundary. Plain <p class="chapter-break"> = titleless break.
// Legacy hr.chapter-break kept for old books. Raw h1/h2 no longer split on their own.
export const CHAPTER_SPLIT_PATTERN = /(?=<p[^>]*class=["'][^"']*chapter-break[^"']*["']|<hr[^>]*class=["']chapter-break["'])/i;
// Counts chapter-start markers (detect a split appearing mid-edit).
export const CHAPTER_MARKER_COUNT_PATTERN = /<p[^>]*class=["'][^"']*chapter-break[^"']*["']/gi;
// Matches a marker at the START of a split part; group 1 = 1|2 (heading level) or undefined (titleless break).
export const CHAPTER_MARKER_PATTERN = /^<p[^>]*class=["'][^"']*chapter-break(?:-h([12]))?[^"']*["'][^>]*>/i;
export const HR_BREAK_PATTERN = /^<hr[^>]*class=["']chapter-break["'][^>]*>/i;
export const HR_DATA_TITLE_PATTERN = /data-title=["']([^"']+)["']/i;

// Flatten heading inner HTML to plain title text (<br>→space, strip tags, collapse).
export function flattenHeadingText(inner: string): string {
    return inner.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
const escapeAttr = (s: string) => s.replace(/"/g, '&quot;');

/**
 * Classify one split part (a chapter) into { title, level }.
 * Shared by the sidebar (useChapterSync) and the worker (content.worker).
 */
export function classifyChapterPart(content: string, index: number): { title: string; level: 'h1' | 'h2' | 'break'; hrTag?: string } {
    const hrMatch = content.match(HR_BREAK_PATTERN);
    if (hrMatch) {
        const titleMatch = hrMatch[0].match(HR_DATA_TITLE_PATTERN);
        const title = decodeEntities(titleMatch ? titleMatch[1] : `Quebra ${index + 1}`);
        return { title, level: 'break', hrTag: hrMatch[0] };
    }
    const markerMatch = content.match(CHAPTER_MARKER_PATTERN);
    if (markerMatch) {
        const level: 'h1' | 'h2' | 'break' = markerMatch[1] === '1' ? 'h1' : markerMatch[1] === '2' ? 'h2' : 'break';
        const dtMatch = markerMatch[0].match(HR_DATA_TITLE_PATTERN);
        let title = dtMatch ? decodeEntities(dtMatch[1]) : '';
        if (!title) {
            const hMatch = content.slice(markerMatch[0].length).match(/^\s*<(h[12])[^>]*>([\s\S]*?)<\/\1>/i);
            if (hMatch) title = decodeEntities(flattenHeadingText(hMatch[2]));
        }
        if (!title) title = level === 'break' ? `Quebra ${index + 1}` : `Sem Título ${index + 1}`;
        return { title, level };
    }
    return { title: `Secção ${index + 1}`, level: 'h1' };
}

/**
 * Insert chapter-break markers before headings (import + legacy-book migration).
 * Idempotent-by-gate: if the content already carries titled markers it is assumed
 * to be in the new model and left untouched, so a manually-removed marker (an h2
 * demoted to an in-body subheading) is not re-added on reload.
 */
export function insertChapterMarkers(html: string): string {
    if (/class=["'][^"']*chapter-break-h[12][^"']*["']/i.test(html)) return html;
    // Legacy titleless break headings → titleless break markers.
    let out = html.replace(/<(h[12])[^>]*class=["'][^"']*chapter-break[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
        (_m, _tag, inner) => `<p class="chapter-break" data-title="${escapeAttr(flattenHeadingText(inner))}"></p>`);
    // Marker before every remaining heading (the heading itself stays intact).
    out = out.replace(/<(h[12])([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, _attrs, inner) => {
        const level = (tag as string).toLowerCase();
        return `<p class="chapter-break-${level}" data-title="${escapeAttr(flattenHeadingText(inner))}"></p>${m}`;
    });
    return out;
}

const EMPTY_HEADING_PATTERN = /<h[1-6][^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/h[1-6]>/gi;
const DUPLICATE_HEADING_PATTERN = /<(h[12])[^>]*>([^<]+)<\/\1>\s*<\1[^>]*>\2<\/\1>/gi;

/**
 * Removes empty and duplicate consecutive headings.
 * Used for chapter navigation to prevent phantom entries in the structure panel.
 * Safe to call on already-clean content (idempotent).
 */
export function cleanHeadings(html: string): string {
    let cleaned = html;
    for (let i = 0; i < 3; i++) {
        const before = cleaned;
        cleaned = cleaned.replace(EMPTY_HEADING_PATTERN, '');
        cleaned = cleaned.replace(DUPLICATE_HEADING_PATTERN, '<$1>$2</$1>');
        if (before === cleaned) break;
    }
    return refreshChapterMarkers(cleaned);
}

// Keep chapter markers in sync WITHOUT creating split boundaries (that is
// insertChapterMarkers' job, run only at import/migration). Runs on every sync:
//  - a stray titleless break heading (h*.chapter-break, e.g. from the old toolbar) → break marker;
//  - refresh each existing -h1/-h2 marker's data-title from the heading right after it,
//    so editing a heading in the body updates the sidebar title.
function refreshChapterMarkers(html: string): string {
    let out = html.replace(/<(h[12])[^>]*class=["'][^"']*chapter-break[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
        (_m, _tag, inner) => `<p class="chapter-break" data-title="${escapeAttr(flattenHeadingText(inner))}"></p>`);
    out = out.replace(/(<p[^>]*class=["'][^"']*chapter-break-h[12][^"']*["'][^>]*data-title=["'])[^"']*(["'][^>]*>\s*<\/p>\s*<(h[12])[^>]*>)([\s\S]*?)(<\/\3>)/gi,
        (_m, pre, mid, _tag, inner, close) => `${pre}${escapeAttr(flattenHeadingText(inner))}${mid}${inner}${close}`);
    return out;
}

// Pre-compiled regex patterns (compiled once, reused many times)
const PATTERNS = {
  // Empty content
  emptyParagraphNbsp: /<p(?![^>]*class=)[^>]*>(&nbsp;|\s|&#160;|&#xa0;)+<\/p>/gi,
  emptyParagraph: /<p(?![^>]*class=)[^>]*>\s*<\/p>/gi,
  // Remove bare span tags (no attributes) but keep content: <span>...</span> → ...
  // Does NOT match: <span class="...">, <span style="...">, etc.
  bareSpanTag: /<span\s*>([\s\S]*?)<\/span>/gi,

  // Links and spans
  links: /<a[^>]*>(.*?)<\/a>/gi,
  // Matches paragraphs containing red font elements (handles nested spans)
  redFontInParagraph: /<p[^>]*>(?:<span[^>]*>)*<font\s+color=["']?#ff0000["']?[^>]*>([\s\S]*?)<\/font>(?:<\/span>)*<\/p>/gi,
  // Matches paragraphs containing red span elements (handles nested spans)
  // Uses greedy matching for outer spans and lazy for content capture
  redSpanInParagraph: /<p[^>]*>(?:<span[^>]*>)*<span[^>]*style="[^"]*color:\s*(?:#ff0000|rgb\(255,\s*0,\s*0\))[^"]*"[^>]*>([\s\S]*?)<\/span>(?:<\/span>)*<\/p>/gi,
  grayFont: /<font\s+color=["']?#231f20["']?[^>]*>([\s\S]*?)<\/font>/gi,
  graySpan: /<span\s+style="[^"]*color:\s*(?:#231f20|rgb\(35,\s*31,\s*32\))[^"]*">([\s\S]*?)<\/span>/gi,

  // Superscript spacing
  supLeadingSpace: /<sup>\s+/gi,
  supTrailingSpace: /\s+<\/sup>/gi,

  // Grammar highlights (for editor)
  grammarHighlight: /<span[^>]*class=["']grammar-error-highlight["'][^>]*>(.*?)<\/span>/gi,

  // List items formatted as paragraphs (alíneas)
  // Matches: <p>a) text</p>, <p>1) text</p>, <p>i) text</p>, e também o marcador envolvido
  // numa tag inline (ex. <p><strong>a) </strong>… do IDML quando o estilo do parágrafo é Bold).
  alineaParagraph: /<p>(\s*)(<(?:strong|b|em|i)>\s*)?([a-z]|[0-9]+|[ivxlcdm]+)\)/gi,
  // First items of list groups (need extra spacing)
  alineaFirst: /<p>(\s*)(<(?:strong|b|em|i)>\s*)?(a|1|i)\)/gi,
} as const;

/**
 * Main HTML cleaning function - applies all transformations in optimized order
 * @param html - Raw HTML string to clean
 * @param options - Optional configuration for specific cleaners
 * @returns Cleaned HTML string
 */
export function cleanHtml(html: string, options: CleanHtmlOptions = {}): string {
  const {
    removeEmptyParagraphs = true,
    removeEmptySpans = true,
    removeLinks = true,
    convertRedSpansToFootnotes = true,
    removeGraySpans = true,
    fixSupSpacing = true,
    removeGrammarHighlights = false, // Only for editor
    addAlineaClass = true,
  } = options;

  let cleaned = html;
  
  // Single pass for all replacements (order matters for some transformations)
  if (removeGrammarHighlights) {
    cleaned = cleaned.replace(PATTERNS.grammarHighlight, '$1');
  }

  if (removeEmptyParagraphs) {
    cleaned = cleaned.replace(PATTERNS.emptyParagraphNbsp, '');
    cleaned = cleaned.replace(PATTERNS.emptyParagraph, '');
  }

  if (removeEmptySpans) {
    // Remove bare span tags (no attributes) but keep their content
    // Iterative to handle nested bare spans: <span><span>text</span></span>
    let beforeClean = '';
    while (beforeClean !== cleaned) {
      beforeClean = cleaned;
      cleaned = cleaned.replace(PATTERNS.bareSpanTag, '$1');
    }
  }

  if (removeLinks) {
    cleaned = cleaned.replace(PATTERNS.links, '$1');
  }

  if (convertRedSpansToFootnotes) {
    cleaned = cleaned.replace(PATTERNS.redFontInParagraph, '<p class="footnote">$1</p>');
    cleaned = cleaned.replace(PATTERNS.redSpanInParagraph, '<p class="footnote">$1</p>');
  }

  if (removeGraySpans) {
    cleaned = cleaned.replace(PATTERNS.grayFont, '$1');
    cleaned = cleaned.replace(PATTERNS.graySpan, '$1');
  }

  if (fixSupSpacing) {
    cleaned = cleaned.replace(PATTERNS.supLeadingSpace, '<sup>');
    cleaned = cleaned.replace(PATTERNS.supTrailingSpace, '</sup>');
  }

  if (addAlineaClass) {
    // First, add p-top to first items (a, 1, i)
    cleaned = cleaned.replace(PATTERNS.alineaFirst, '<p class="alinea p-non-indent p-top">$1$2$3)');
    // Then add alinea class to remaining list items
    cleaned = cleaned.replace(PATTERNS.alineaParagraph, '<p class="alinea p-non-indent">$1$2$3)');
  }

  // Remove ALL bare spans (no attributes) inside footnote paragraphs.
  // Uses a callback to process each paragraph independently so nested spans
  // and spans mixed with other content are all handled correctly.
  cleaned = cleaned.replace(
    /<p([^>]*class="[^"]*footnote[^"]*"[^>]*)>([\s\S]*?)<\/p>/gi,
    (_match, attrs: string, content: string) => {
      let inner = content;
      let prev = '';
      while (prev !== inner) {
        prev = inner;
        inner = inner.replace(/<span\s*>([\s\S]*?)<\/span>/gi, '$1');
      }
      return `<p${attrs}>${inner}</p>`;
    }
  );

  return cleaned;
}

/**
 * Options for HTML cleaning
 */
export interface CleanHtmlOptions {
  removeEmptyParagraphs?: boolean;
  removeEmptySpans?: boolean;
  removeLinks?: boolean;
  convertRedSpansToFootnotes?: boolean;
  removeGraySpans?: boolean;
  fixSupSpacing?: boolean;
  removeGrammarHighlights?: boolean;
  addAlineaClass?: boolean;
}

/**
 * Clean HTML for EPUB export (includes all transformations)
 */
export function cleanEpubHtml(html: string): string {
  return cleanHtml(html, {
    removeEmptyParagraphs: true,
    removeEmptySpans: true,
    removeLinks: true,
    convertRedSpansToFootnotes: true,
    removeGraySpans: true,
    fixSupSpacing: true,
    addAlineaClass: true,
  });
}

// Normaliza recuo pendente inline (IDML): `<p style="margin-left:M;text-indent:-T">`.
//  - net (M + text-indent) == 0  → remove o recuo (ex.: 0.71/-0.71 → sem estilo);
//  - net != 0 (recuo pendente real, ex.: 1.42/-0.71) → `margin-left:2.15em` (sem text-indent).
// Só toca em text-indent NEGATIVO em `em` (o que o importador IDML emite). Preserva outras
// props; idempotente (após normalizar não há text-indent negativo).
const HANGING_MARGIN = 'margin-left:2.15em';
export function collapseHangingIndents(html: string): string {
  if (!/text-indent\s*:\s*-/.test(html)) return html; // nada a normalizar
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll('[style*="text-indent"]').forEach((el) => {
    const st = el.getAttribute('style') || '';
    const ti = /text-indent\s*:\s*(-[\d.]+)em/i.exec(st);
    if (!ti) return; // só hanging (text-indent negativo em em)
    const ml = /margin-left\s*:\s*(-?[\d.]+)em/i.exec(st);
    const eff = (ml ? parseFloat(ml[1]) : 0) + parseFloat(ti[1]); // ti negativo → posição da 1ª linha
    let rest = st.replace(/margin-left\s*:[^;]*;?/i, '').replace(/text-indent\s*:[^;]*;?/i, '');
    rest = rest.replace(/\s*;\s*;\s*/g, ';').replace(/^\s*;|;\s*$/g, '').trim();
    const parts: string[] = [];
    if (Math.abs(eff) > 0.005) parts.push(HANGING_MARGIN); // net != 0 → recuo fixo 1.55em
    if (rest) parts.push(rest);
    if (parts.length) el.setAttribute('style', parts.join(';'));
    else el.removeAttribute('style');
  });
  return doc.body.innerHTML;
}

/**
 * Clean HTML from editor (includes grammar highlight removal)
 */
export function cleanEditorHtml(html: string): string {
  return insertChapterMarkers(convertFullyStyledParas(cleanHtml(cleanHeadings(collapseHangingIndents(html)), {
    removeEmptyParagraphs: true,
    removeEmptySpans: true,
    removeLinks: true,
    convertRedSpansToFootnotes: true,
    removeGraySpans: true,
    fixSupSpacing: true,
    removeGrammarHighlights: true,
    addAlineaClass: true,
  })));
}

export interface ImportOptions {
  indentAllParagraphs: boolean;
  topOnBoldParagraphs: boolean;
  noIndentAfterBold: boolean;
  wrapBoldWithNext: boolean;
  convertListsToDialogue: boolean;
}

// Classes that already control indentation — skip these when applying p-indent
const INDENT_CONTROLLED_CLASSES = ['footnote', 'alinea', 'drop-cap', 'p-non-indent', 'p-indent', 'p-center', 'p-bold', 'p-bold-italic', 'p-border-top', 'p-border-bottom', 'p-border-sides'];
// Classes com semântica de indentação PRÓPRIA — não forçar non-indent nelas (ao contrário
// de p-indent/p-non-indent, que o "sem indentação após negrito" pode sobrepor).
const SPECIAL_INDENT_CLASSES = ['footnote', 'alinea', 'drop-cap', 'p-center', 'p-border-top', 'p-border-bottom', 'p-border-sides'];

// True when every non-whitespace text node sits inside one of `tags` (ex. STRONG/B).
function isFullyWrapped(p: HTMLParagraphElement, tags: string[]): boolean {
  const doc = p.ownerDocument;
  const walker = doc.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let hasText = false;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!(node.textContent || '').trim()) continue;
    hasText = true;
    let el = node.parentElement;
    let wrapped = false;
    while (el && el !== p) {
      if (tags.includes(el.tagName)) { wrapped = true; break; }
      el = el.parentElement;
    }
    if (!wrapped) return false;
  }
  return hasText;
}

// True when every non-whitespace text node sits inside <strong>/<b>
function isFullyBoldParagraph(p: HTMLParagraphElement): boolean {
  return isFullyWrapped(p, ['STRONG', 'B']);
}

// True when every non-whitespace text node sits inside <em>/<i>
function isFullyItalicParagraph(p: HTMLParagraphElement): boolean {
  return isFullyWrapped(p, ['EM', 'I']);
}

// Parágrafo TODO a negrito/itálico → estilo de parágrafo (p-bold/p-italic/p-bold-italic),
// removendo as tags inline <strong>/<em> (mantém <sup> e restante). Sem mudança visual,
// só markup mais limpo e editável como estilo. Corre em todos os imports (cleanEditorHtml).
function convertFullyStyledParas(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const SKIP = ['p-bold', 'p-italic', 'p-bold-italic', 'footnote'];
  const unwrap = (p: HTMLElement, tags: string[]) => {
    for (const el of Array.from(p.querySelectorAll(tags.join(',')))) {
      while (el.firstChild) el.parentNode!.insertBefore(el.firstChild, el);
      el.remove();
    }
  };
  for (const p of Array.from(doc.body.querySelectorAll('p')) as HTMLParagraphElement[]) {
    if (SKIP.some(c => p.classList.contains(c))) continue;
    const bold = isFullyBoldParagraph(p);
    const italic = isFullyItalicParagraph(p);
    if (bold && italic) { p.classList.add('p-bold-italic'); unwrap(p, ['strong', 'b', 'em', 'i']); }
    else if (bold) { p.classList.add('p-bold'); unwrap(p, ['strong', 'b']); }
    else if (italic) { p.classList.add('p-italic'); unwrap(p, ['em', 'i']); }
    // Negrito = título/rótulo → nunca recolhido de 1ª linha (sem p.p-indent.p-bold)
    if (bold) p.classList.remove('p-indent');
  }
  return doc.body.innerHTML;
}

/**
 * Apply user-selected import options to imported HTML
 */
export function applyImportOptions(html: string, options: ImportOptions): string {
  if (!options.indentAllParagraphs && !options.topOnBoldParagraphs && !options.noIndentAfterBold && !options.wrapBoldWithNext) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const paragraphs = Array.from(doc.body.querySelectorAll('p'));
  const needsBold = options.topOnBoldParagraphs || options.noIndentAfterBold || options.wrapBoldWithNext;
  const boldParagraphs = needsBold ? new Set(paragraphs.filter(isFullyBoldParagraph)) : new Set<HTMLParagraphElement>();

  // Negrito = negrito inline (isFullyBoldParagraph) OU estilo de parágrafo p-bold
  // (negrito via classe, vindo do mapeamento de estilos Word — sem <strong> inline).
  const isBoldPara = (el: Element) =>
    boldParagraphs.has(el as HTMLParagraphElement) || el.classList.contains('p-bold');

  paragraphs.forEach((p) => {
    if (p.className.includes('chapter-break')) return; // structural marker — never indented
    const prev = p.previousElementSibling;
    const afterBold = options.noIndentAfterBold && prev?.tagName === 'P' && isBoldPara(prev);
    // isBoldPara (não só o set) → apanha também os já convertidos em classe p-bold pelo cleanEditorHtml
    const boldTop = options.topOnBoldParagraphs && !p.classList.contains('footnote') && isBoldPara(p);

    if (boldTop) {
      p.classList.add('p-top');
    }
    const hasSpecialIndent = SPECIAL_INDENT_CLASSES.some((cls) => p.classList.contains(cls));
    if ((afterBold || boldTop) && !hasSpecialIndent) {
      // Força sem indentação, sobrepondo-se a um p-indent já aplicado (ex. do firstLine no import docx)
      p.classList.remove('p-indent');
      p.classList.add('p-non-indent');
    } else if (options.indentAllParagraphs && !INDENT_CONTROLLED_CLASSES.some((cls) => p.classList.contains(cls))) {
      p.classList.add('p-indent');
    }
  });

  // Agrupar elementos consecutivos num <div class="noBreak"> (evita quebra de página no meio)
  if (options.wrapBoldWithNext) {
    const inNoBreak = (el: Element | null) => !!el?.parentElement?.classList.contains('noBreak');
    const hasImage = (el: Element | null) => !!el && (el.tagName === 'IMG' || !!el.querySelector('img'));
    const wrapGroup = (els: Element[]) => {
      if (els.some((e) => inNoBreak(e))) return;
      const wrapper = doc.createElement('div');
      wrapper.className = 'noBreak';
      els[0].before(wrapper);
      wrapper.append(...els);
    };

    // (a) Legenda (Gráfico/Tabela/Figura) + imagem seguinte [+ parágrafo "Fonte:"]
    //     reusa o snapshot `paragraphs` (sem <p> novos desde a recolha; guard inNoBreak trata o reparenting)
    for (const p of paragraphs) {
      if (inNoBreak(p)) continue;
      if (!/^\s*(gr[áa]fico|tabela|figura)\b/i.test(p.textContent || '')) continue;
      const img = p.nextElementSibling;
      if (!hasImage(img)) continue;
      const group = [p, img as Element];
      const src = (img as Element).nextElementSibling;
      if (src && /^\s*fonte\s*:/i.test(src.textContent || '')) group.push(src);
      wrapGroup(group);
    }

    // (b) Título h3/h4 + elemento seguinte (evita título órfão no fim da página)
    for (const h of Array.from(doc.body.querySelectorAll('h3, h4'))) {
      if (inNoBreak(h)) continue;
      const next = h.nextElementSibling;
      if (next?.tagName !== 'P') continue;
      wrapGroup([h, next]);
    }

    // (c) Corrida de parágrafos negrito (inline OU classe p-bold, ex. "p-bold p-top")
    //     + o parágrafo normal a seguir → todos no mesmo noBreak.
    const isBoldP = (el: Element | null) =>
      el?.tagName === 'P' && isBoldPara(el) && !el.classList.contains('footnote');
    for (const p of paragraphs) {
      if (!isBoldP(p) || inNoBreak(p)) continue;
      const group: Element[] = [p];
      let sib = p.nextElementSibling;
      while (isBoldP(sib)) {
        group.push(sib as Element);
        sib = (sib as Element).nextElementSibling;
      }
      if (sib?.tagName === 'P') group.push(sib); // parágrafo normal a seguir
      if (group.length < 2) continue;
      wrapGroup(group);
    }
  }
  return doc.body.innerHTML;
}

/**
 * Convert top-level bullet lists into dialogue paragraphs (— text).
 * Same rule as the docx import pass, runnable on editor content at any time.
 */
export function convertListsToDialogue(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  Array.from(doc.querySelectorAll('ul'))
    .filter((ul) => !ul.parentElement?.closest('ul'))
    .forEach((topUl) => {
      const parent = topUl.parentNode;
      if (!parent) { topUl.remove(); return; }
      topUl.querySelectorAll('li').forEach((li) => {
        const clone = li.cloneNode(true) as Element;
        clone.querySelectorAll('ul, ol').forEach((n) => n.remove());
        const trimmed = clone.innerHTML.trim();
        if (!trimmed) return;
        const p = doc.createElement('p');
        p.innerHTML = '— ' + trimmed;
        parent.insertBefore(p, topUl);
      });
      parent.removeChild(topUl);
    });
  return doc.body.innerHTML;
}

/**
 * Prepend a "Ficha Técnica" untitled chapter to imported content.
 * Everything before the first heading belongs to it and gets small text (p-small) without indentation.
 */
export function prependFichaTecnica(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const styleFichaParagraph = (p: Element) => {
    p.classList.add('p-small');
    p.classList.remove('p-indent');
    p.classList.add('p-non-indent');
  };
  for (const el of Array.from(doc.body.children)) {
    if (el.tagName === 'H1' || el.tagName === 'H2') break;
    if (el.tagName === 'P') styleFichaParagraph(el);
    else if (el.tagName === 'DIV') el.querySelectorAll('p').forEach(styleFichaParagraph);
  }
  return '<p class="chapter-break" data-title="Ficha Técnica"></p>' + doc.body.innerHTML;
}

/**
 * DOM-based cleaning for TinyMCE SetContent event
 * More efficient than regex for DOM manipulation
 */
export function cleanEditorDOM(body: HTMLElement): void {
  // Remove empty paragraphs with nbsp, but preserve paragraphs containing media elements
  const emptyParas = body.querySelectorAll('p');
  emptyParas.forEach((p: HTMLParagraphElement) => {
    if (p.className.trim() !== '') return;
    if (p.querySelector('img, hr, figure, table, video, audio, iframe')) return;
    const text = p.textContent || '';
    const html = p.innerHTML || '';
    if (text.trim() === '' || /^(&nbsp;|\s|&#160;|&#xa0;)+$/.test(html.trim())) {
      p.remove();
    }
  });

  // Remove bare span tags (no attributes or only empty attributes) but keep their content
  const allSpans = body.querySelectorAll('span');
  allSpans.forEach((span: HTMLSpanElement) => {
    // Check if span has no attributes or only empty attributes (class="", style="", etc.)
    const hasOnlyEmptyAttrs = Array.from(span.attributes).every(attr => 
      attr.value.trim() === ''
    );
    // Only remove spans without any attributes or with only empty attributes
    if (span.attributes.length === 0 || hasOnlyEmptyAttrs) {
      const parent = span.parentNode;
      if (parent) {
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
      }
    }
  });

  // Remove all links but keep content
  const links = body.querySelectorAll('a');
  links.forEach((link: HTMLAnchorElement) => {
    const parent = link.parentNode;
    if (parent) {
      while (link.firstChild) {
        parent.insertBefore(link.firstChild, link);
      }
      parent.removeChild(link);
    }
  });

  // Convert red spans to footnotes
  const paragraphs = body.querySelectorAll('p');
  paragraphs.forEach((p: HTMLParagraphElement) => {
    const redSpan = p.querySelector('span[style*="color"][style*="#ff0000"], span[style*="color"][style*="rgb(255, 0, 0)"]');
    if (!redSpan) return;

    // Check if paragraph contains only the red content (directly or nested in spans)
    // Get all text content to verify it's all from the red span
    const allText = p.textContent || '';
    const redText = redSpan.textContent || '';
    
    // Check if all paragraph content comes from the red span
    const hasOnlyRedContent = allText.trim() === redText.trim();
    
    // Also check if the red span's parent chain within the paragraph is only spans
    let parent = redSpan.parentElement;
    let onlySpansInPath = true;
    while (parent && parent !== p) {
      if (parent.tagName !== 'SPAN') {
        onlySpansInPath = false;
        break;
      }
      parent = parent.parentElement;
    }

    if (hasOnlyRedContent && onlySpansInPath) {
      p.classList.add('footnote');
      // Move red span's content before the red span itself
      while (redSpan.firstChild) {
        redSpan.parentElement!.insertBefore(redSpan.firstChild, redSpan);
      }
      redSpan.remove();
      // Remove any now-empty wrapper spans
      const emptySpans = p.querySelectorAll('span:empty');
      emptySpans.forEach((span: Element) => span.remove());
    }
  });

  // Remove dark gray spans but keep content
  const graySpans = body.querySelectorAll('span[style*="color"][style*="#231f20"], span[style*="color"][style*="rgb(35, 31, 32)"]');
  graySpans.forEach((span: Element) => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    }
  });

  // Remove spaces inside <sup> tags
  const supTags = body.querySelectorAll('sup');
  supTags.forEach((sup: HTMLElement) => {
    if (sup.firstChild && sup.firstChild.nodeType === Node.TEXT_NODE) {
      sup.firstChild.textContent = (sup.firstChild.textContent || '').trim();
    }
  });

  // Add alinea class to list-like paragraphs
  // Estilos de parágrafo explícitos (vindos do mapeamento de estilos no import) ganham
  // prioridade: se o <p> já tem um destes, NÃO se auto-deteta alínea (a escolha do utilizador vence).
  const STYLED_CLASSES = ['p-indent', 'p-center', 'p-small', 'p-bold', 'p-italic', 'p-bold-italic', 'p-quote', 'p-legendas', 'drop-cap', 'footnote'];
  const allParagraphs = body.querySelectorAll('p');
  allParagraphs.forEach((p: HTMLParagraphElement) => {
    const text = (p.textContent || '').trim();
    // Match patterns like: a), b), 1), 2), i), ii), etc.
    const alineaPattern = /^([a-z]|[0-9]+|[ivxlcdm]+)\)/i;
    const firstItemPattern = /^(a|1|i)\)/i;

    if (STYLED_CLASSES.some(c => p.classList.contains(c))) return; // estilo mapeado vence
    if (alineaPattern.test(text) && !p.classList.contains('alinea')) {
      p.classList.add('alinea');
      p.classList.add('p-non-indent');
      // Add p-top to first items (a, 1, i)
      if (firstItemPattern.test(text)) {
        p.classList.add('p-top');
      }
    }
  });

  // Remove ALL bare spans (no attributes) inside footnote paragraphs.
  // Processes deepest spans first so nested unwrapping is correct in one pass.
  const footnoteParagraphs = body.querySelectorAll('p.footnote');
  footnoteParagraphs.forEach((p: Element) => {
    // querySelectorAll returns in document order (shallowest first).
    // Reversing ensures inner spans are removed before outer ones.
    const bareSpans = Array.from(p.querySelectorAll('span'))
      .filter(s => s.attributes.length === 0)
      .reverse();
    bareSpans.forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
  });
}
