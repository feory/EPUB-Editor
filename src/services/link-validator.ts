export interface LinkIssue {
  type: 'broken-url' | 'spaced-href';
  message: string;
  url: string;
  context: string;
}

export interface LinkReport {
  issues: LinkIssue[];
  totalLinks: number;
}

function decodeSpaces(s: string): string {
  // Espaços não-quebráveis (entidade ou carácter cru) contam como espaço — a
  // extração PDF mete frequentemente NBSP entre os caracteres do URL.
  return s.replace(/&nbsp;|&#160;|&#xa0;|\u00a0/gi, ' ').replace(/&amp;/gi, '&');
}

const URL_CHAR = /[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/;
// Espaço "partidor" de URL: normal OU não-quebrável (a extração PDF usa ambos).
const isUrlSpace = (c: string) => c === ' ' || c === '\u00a0';
// Caracteres estruturais de URL: um espaço adjacente a um destes (de um lado OU
// outro) é uma quebra INTERNA do URL, não o seu fim — ex. "ab_ channel", "http :".
const STRUCT = new Set([':', '/', '?', '=', '&', '#', '_', '@', '%', '-']);

/**
 * Varre um URL a partir de `start` (que aponta para "http"/"www"), consumindo
 * caracteres de URL e tolerando espaços INTERNOS (quebras de extração PDF).
 * Um espaço termina o URL apenas quando separa de texto normal (ambos os lados
 * alfanuméricos sem pontuação estrutural). Devolve o fim e se houve espaço interno.
 */
function scanUrl(text: string, start: number): { end: number; hadSpace: boolean } {
  let i = start;
  let hadSpace = false;
  while (i < text.length) {
    while (i < text.length && URL_CHAR.test(text[i])) i++;
    if (!isUrlSpace(text[i]) || isUrlSpace(text[i + 1])) break; // fim, ou 2+ espaços = fronteira real
    const lastCh = i > start ? text[i - 1] : '';
    const nextCh = text[i + 1] || '';
    const afterNext = text[i + 2] || '';
    const internal =
      STRUCT.has(lastCh) || STRUCT.has(nextCh) ||
      (lastCh === '.' && /[a-z0-9]/.test(nextCh)) ||      // "youtube. com"
      (nextCh === '.' && /[a-z0-9]/.test(afterNext));     // "exemplo .com"
    if (!internal) break;
    hadSpace = true;
    i += 1; // saltar o espaço interno
  }
  return { end: i, hadSpace };
}

// Regiões de URL partido (com espaço interno) num texto plano. [start, end).
function brokenUrlRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const startRe = /\b(?:https?|www)/gi;
  let s: RegExpExecArray | null;
  while ((s = startRe.exec(text)) !== null) {
    const { end, hadSpace } = scanUrl(text, s.index);
    startRe.lastIndex = Math.max(end, s.index + 1);
    if (hadSpace) ranges.push({ start: s.index, end });
  }
  return ranges;
}

/**
 * Valida os links do miolo. Deteta:
 * - <a href="..."> cujo endereço contém espaços (link partido)
 * - URLs no texto visível partidos por espaços (esquema, host OU query/path)
 * O `context` é uma fatia VERBATIM do texto para o scrollToContent do editor
 * localizar e assinalar o local.
 */
export function validateLinks(html: string): LinkReport {
  const issues: LinkIssue[] = [];

  // (1) href com espaços (link já formado mas com endereço partido)
  let totalAnchors = 0;
  const hrefRe = /<a[^>]*\shref="([^"]*)"[^>]*>(.*?)<\/a>/gis;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    totalAnchors++;
    const href = decodeSpaces(m[1]).trim();
    if (/\s/.test(href)) {
      const text = m[2].replace(/<[^>]+>/g, '').trim();
      issues.push({
        type: 'spaced-href',
        message: 'Link com espaços no endereço (href).',
        url: href,
        context: text || href,
      });
    }
  }

  // (2) URLs partidos no texto visível — manter o texto dos <a>, restantes tags viram espaço
  const text = decodeSpaces(html.replace(/<a[^>]*>|<\/a>/gi, '').replace(/<[^>]+>/g, ' '));
  const totalPlain = (text.match(/https?:|www\./gi) || []).length;

  for (const { start, end } of brokenUrlRanges(text)) {
    issues.push({
      type: 'broken-url',
      message: 'URL com espaços no endereço.',
      url: text.slice(start, end).replace(/\s+/g, ' ').trim(),
      context: text.slice(Math.max(0, start - 15), Math.min(text.length, end + 15)).trim(),
    });
  }

  return { issues, totalLinks: totalAnchors + totalPlain };
}

// Remove os espaços internos dos URLs partidos de um texto plano (sem tags).
function despaceUrls(text: string): { text: string; fixed: number } {
  const ranges = brokenUrlRanges(text);
  if (ranges.length === 0) return { text, fixed: 0 };
  let out = '';
  let cursor = 0;
  for (const { start, end } of ranges) {
    out += text.slice(cursor, start) + text.slice(start, end).replace(/\s+/g, '');
    cursor = end;
  }
  out += text.slice(cursor);
  return { text: out, fixed: ranges.length };
}

/**
 * Corrige os espaçamentos dos links: remove os espaços internos dos URLs
 * partidos. Atua nos text nodes (seguro quanto a tags/posições) e nos href
 * dos <a>. Devolve o HTML corrigido e o nº de correções.
 */
export function fixLinks(html: string): { html: string; fixed: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let fixed = 0;

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const original = node.textContent || '';
    if (!/https?|www/i.test(original)) continue;
    const res = despaceUrls(original);
    if (res.fixed > 0 && res.text !== original) {
      node.textContent = res.text;
      fixed += res.fixed;
    }
  }

  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (/\s/.test(href.trim())) {
      a.setAttribute('href', href.replace(/\s+/g, ''));
      fixed++;
    }
  });

  return { html: doc.body.innerHTML, fixed };
}
