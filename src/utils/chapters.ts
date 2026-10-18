/**
 * Capítulos: o único module que sabe como o livro (HTML do editor) se divide em capítulos.
 * A fronteira é um MARCADOR (<p class="chapter-break[-hN]" data-title>) inserido ANTES do heading;
 * <hr class="chapter-break"> é o formato legacy. Quem precisa de capítulos pede-os aqui (split/classify/
 * boundary); o padrão de divisão não é exportado.
 */

import { decodeEntities } from './entities';

// A chapter break is a standalone MARKER paragraph placed BEFORE each heading
// (<p class="chapter-break-h1|-h2" data-title="…">) — the marker, not the heading,
// is the split boundary. Plain <p class="chapter-break"> = titleless break.
// Legacy hr.chapter-break kept for old books. Raw h1/h2 no longer split on their own.
const CHAPTER_SPLIT_PATTERN = /(?=<p[^>]*class=["'][^"']*chapter-break[^"']*["']|<hr[^>]*class=["']chapter-break["'])/i;
// Counts chapter-start markers (detect a split appearing mid-edit).
const CHAPTER_MARKER_COUNT_PATTERN = /<p[^>]*class=["'][^"']*chapter-break[^"']*["']/gi;
const HR_BREAK_PATTERN = /^<hr[^>]*class=["']chapter-break["'][^>]*>/i;
// Cada aspa fecha com a SUA aspa: o apóstrofo de data-title="D'Artagnan" não termina o valor.
const HR_DATA_TITLE_PATTERN = /data-title=(?:"([^"]*)"|'([^']*)')/i;
const dataTitleOf = (tag: string): string | undefined => {
    const m = tag.match(HR_DATA_TITLE_PATTERN);
    return (m && (m[1] ?? m[2])) || undefined;
};

// Flatten heading inner HTML to plain title text (<br>→space, strip tags, collapse).
export function flattenHeadingText(inner: string): string {
    return inner
        .replace(/\(?\s*<sup\b[^>]*>\s*(?:<a\b[^>]*>)?\s*[\d*]+\s*(?:<\/a>)?\s*<\/sup>\s*\)?/gi, '') // chamada de nota — "(143)" — não entra no nome
        .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
const escapeAttr = (s: string) => s.replace(/"/g, '&quot;');

/**
 * Matches a chapter-break <p> marker as a WHOLE element (open tag through </p>) at the
 * start of `content` — non-greedy, since the marker doesn't always serialize empty
 * (TinyMCE can fill it with &nbsp;/<br> to keep the block focusable). Shared by
 * classifyChapterPart below and toc.ts's changeChapterLevel — the one place that knows
 * what a marker element looks like. `title` is the RAW (still HTML-escaped) attribute
 * value — callers that display it must decodeEntities(); callers that reinsert it into
 * new markup (changeChapterLevel) must NOT, or they'll break the attribute's escaping.
 */
export function matchChapterMarkerElement(content: string): { raw: string; level: 'h1' | 'h2' | 'h3' | null; title: string } | null {
    const m = content.match(/^<p[^>]*class=["'][^"']*chapter-break(?:-h([123]))?[^"']*["'][^>]*>[\s\S]*?<\/p>/i);
    if (!m) return null;
    const level = m[1] === '1' ? 'h1' : m[1] === '2' ? 'h2' : m[1] === '3' ? 'h3' : null;
    return { raw: m[0], level, title: dataTitleOf(m[0]) ?? '' };
}

/**
 * Classify one split part (a chapter) into { title, level }.
 * Shared by the sidebar (useChapterSync) and the index linker (indice-links.ts).
 */
export function classifyChapterPart(content: string, index: number): { title: string; level: 'h1' | 'h2' | 'h3' | 'break'; hrTag?: string } {
    const hrMatch = content.match(HR_BREAK_PATTERN);
    if (hrMatch) {
        const title = decodeEntities(dataTitleOf(hrMatch[0]) ?? `Quebra ${index + 1}`);
        return { title, level: 'break', hrTag: hrMatch[0] };
    }
    const marker = matchChapterMarkerElement(content);
    if (marker) {
        const level = marker.level ?? 'break';
        let title = marker.title ? decodeEntities(marker.title) : '';
        if (!title) {
            const hMatch = content.slice(marker.raw.length).match(/^\s*<(h[123])[^>]*>([\s\S]*?)<\/\1>/i);
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
    // Só h1/h2 continuam a auto-promover a capítulo no import — h3 fica disponível como nível
    // (via Editor de TOC), mas não se torna quebra sozinho só por aparecer no documento
    // (continua a poder ser um subtítulo normal dentro do corpo).
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


// Interface: dividir o livro em capítulos. `splitChapters` descarta partes vazias (índice = índice em chapters[]);
// `splitChapterSegments` devolve os segmentos tal e qual — `segments.join('') === html` — para quem edita um
// segmento e reescreve o livro.
export const splitChapters = (html: string): string[] => html.split(CHAPTER_SPLIT_PATTERN).filter(p => p.trim().length > 0);
export const splitChapterSegments = (html: string): string[] => html.split(CHAPTER_SPLIT_PATTERN);
export const countChapterMarkers = (html: string): number => (html.match(CHAPTER_MARKER_COUNT_PATTERN) || []).length;

/**
 * Fronteira no início de uma parte: marcador <p> OU <hr class="chapter-break"> legacy. `title` é o valor RAW do
 * data-title (ainda escapado de HTML) — quem o mostra faz decodeEntities, quem o reinsere em markup NÃO.
 */
export function matchChapterBoundary(content: string): { raw: string; level: 'h1' | 'h2' | 'h3' | null; title: string; legacyHr: boolean } | null {
    const hr = content.match(HR_BREAK_PATTERN);
    if (hr) return { raw: hr[0], level: null, title: dataTitleOf(hr[0]) ?? '', legacyHr: true };
    const marker = matchChapterMarkerElement(content);
    return marker ? { ...marker, legacyHr: false } : null;
}

// Keep chapter markers in sync WITHOUT creating split boundaries (that is
// insertChapterMarkers' job, run only at import/migration). Runs on every sync:
//  - a stray titleless break heading (h*.chapter-break, e.g. from the old toolbar) → break marker.
// Does NOT refresh -h1/-h2/-h3 markers' data-title from the heading text: editing a heading
// in the body must never change the Estrutura/TOC entry — that's only editable via the
// panel's own rename action (renameChapterPart).
export function refreshChapterMarkers(html: string): string {
    return html.replace(/<(h[12])[^>]*class=["'][^"']*chapter-break[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
        (_m, _tag, inner) => `<p class="chapter-break" data-title="${escapeAttr(flattenHeadingText(inner))}"></p>`);
}
