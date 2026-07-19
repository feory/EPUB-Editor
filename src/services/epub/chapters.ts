import { decodeHtmlEntities } from './html-utils';
import type { Section } from './types';

const relocateFootnotes = (html: string): string => {
    const footnoteRegex = /<(p|aside)[^>]*class="[^"]*footnote[^"]*"[^>]*>.*?<\/\1>/gs;
    const found = html.match(footnoteRegex) || [];
    let result = html.replace(footnoteRegex, '');
    if (found.length > 0) {
        result += '\n<div class="footnotes-section">\n' + found.join('\n') + '\n</div>';
    }
    return result;
};

export function buildSections(processedContent: string): Section[] {
    const sections: Section[] = [];
    let currentH1Idx = -1;

    const pushBreakSection = (
        title: string,
        fallback: string,
        strippedContent: string,
        idx: number,
        hiddenFromToc = true,
    ) => {
        const body = strippedContent.trim().length === 0 ? '<p>&#160;</p>' : strippedContent;
        sections.push({
            title: title || fallback,
            content: relocateFootnotes(body),
            level: 'break',
            parentIdx: currentH1Idx,
            childIndices: [],
            hiddenFromToc,
        });
        if (currentH1Idx >= 0) sections[currentH1Idx].childIndices.push(idx);
    };

    // Split on chapter-break MARKERS (and legacy hr.chapter-break). The marker — not the
    // heading — is the boundary; it is editor-only and stripped from the exported body.
    const parts = processedContent.split(/(?=<p[^>]*class=["'][^"']*chapter-break[^"']*["']|<hr[^>]*class=["']chapter-break["'])/gi);

    parts.forEach((part) => {
        let content = part.trim();
        if (content.length === 0) return;

        const thisSectionIdx = sections.length;

        const hrMatch = content.match(/^<hr[^>]*class=["']chapter-break["'][^>]*>/i);
        if (hrMatch) {
            const titleMatch = hrMatch[0].match(/data-title=["']([^"']+)["']/i);
            const title = decodeHtmlEntities(titleMatch ? titleMatch[1] : '');
            content = content.replace(/^<hr[^>]*class=["']chapter-break["'][^>]*\/*>/i, '');
            pushBreakSection(title, `Quebra ${thisSectionIdx + 1}`, content, thisSectionIdx);
            return;
        }

        const markerMatch = content.match(/^<p[^>]*class=["'][^"']*chapter-break(?:-h([12]))?[^"']*["'][^>]*>[\s\S]*?<\/p>/i);
        if (markerMatch) {
            const dt = markerMatch[0].match(/data-title=["']([^"']*)["']/i);
            const dtTitle = decodeHtmlEntities(dt ? dt[1] : '');
            content = content.slice(markerMatch[0].length).trim(); // strip the editor-only marker
            const level = markerMatch[1]; // '1' | '2' | undefined (titleless break)
            if (!level) {
                const isHidden = /\[hidden\]/i.test(dtTitle);
                const title = dtTitle.replace(/\[hidden\]/gi, '').trim();
                pushBreakSection(title, `Capítulo ${thisSectionIdx + 1}`, content, thisSectionIdx, isHidden);
                return;
            }
            const hMatch = content.match(/^<(h[12])[^>]*>([\s\S]*?)<\/\1>/i);
            const headTitle = hMatch ? decodeHtmlEntities(hMatch[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()) : '';
            const title = dtTitle || headTitle;
            if (level === '1') {
                sections.push({ title: title || `Capítulo ${thisSectionIdx + 1}`, content: relocateFootnotes(content), level: 'h1', parentIdx: -1, childIndices: [] });
                currentH1Idx = thisSectionIdx;
            } else {
                sections.push({ title: title || `Secção ${thisSectionIdx + 1}`, content: relocateFootnotes(content), level: 'h2', parentIdx: currentH1Idx, childIndices: [] });
                if (currentH1Idx >= 0) sections[currentH1Idx].childIndices.push(thisSectionIdx);
            }
            return;
        }

        sections.push({
            title: `Secção ${thisSectionIdx + 1}`,
            content: relocateFootnotes(content),
            level: 'h1',
            parentIdx: -1,
            childIndices: [],
        });
        currentH1Idx = thisSectionIdx;
    });

    if (sections.length === 0) {
        sections.push({ title: 'Início', content: processedContent, level: 'h1', parentIdx: -1, childIndices: [] });
    }

    return sections;
}
