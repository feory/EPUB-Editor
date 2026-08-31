import { decodeHtmlEntities } from './html-utils';
import type { Section } from './types';
import { CHAPTER_SPLIT_PATTERN, HR_BREAK_PATTERN, HR_DATA_TITLE_PATTERN, matchChapterMarkerElement, flattenHeadingText } from '../../utils/html-cleaner';

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
    const parts = processedContent.split(CHAPTER_SPLIT_PATTERN);

    parts.forEach((part) => {
        let content = part.trim();
        if (content.length === 0) return;

        const thisSectionIdx = sections.length;

        const hrMatch = content.match(HR_BREAK_PATTERN);
        if (hrMatch) {
            const titleMatch = hrMatch[0].match(HR_DATA_TITLE_PATTERN);
            const title = decodeHtmlEntities(titleMatch ? titleMatch[1] : '');
            content = content.slice(hrMatch[0].length).trim();
            pushBreakSection(title, `Quebra ${thisSectionIdx + 1}`, content, thisSectionIdx);
            return;
        }

        const marker = matchChapterMarkerElement(content);
        if (marker) {
            const dtTitle = decodeHtmlEntities(marker.title);
            content = content.slice(marker.raw.length).trim(); // strip the editor-only marker
            if (!marker.level) {
                const isHidden = /\[hidden\]/i.test(dtTitle);
                const title = dtTitle.replace(/\[hidden\]/gi, '').trim();
                pushBreakSection(title, `Capítulo ${thisSectionIdx + 1}`, content, thisSectionIdx, isHidden);
                return;
            }
            const hMatch = content.match(/^<(h[123])[^>]*>([\s\S]*?)<\/\1>/i);
            const headTitle = hMatch ? decodeHtmlEntities(flattenHeadingText(hMatch[2])) : '';
            const title = dtTitle || headTitle;
            if (marker.level === 'h1') {
                sections.push({ title: title || `Capítulo ${thisSectionIdx + 1}`, content: relocateFootnotes(content), level: 'h1', parentIdx: -1, childIndices: [] });
                currentH1Idx = thisSectionIdx;
            } else {
                sections.push({ title: title || `Secção ${thisSectionIdx + 1}`, content: relocateFootnotes(content), level: marker.level, parentIdx: currentH1Idx, childIndices: [] });
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
