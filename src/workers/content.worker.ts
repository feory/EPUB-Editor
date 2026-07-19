// Content processing Web Worker
// Handles heavy operations for large documents without blocking the UI

import { cleanEditorHtml, cleanHeadings, CHAPTER_SPLIT_PATTERN, classifyChapterPart } from '../utils/html-cleaner';

/**
 * Full cleaning: heading deduplication + all HTML normalisations.
 * Identical pipeline to the main thread so large and small books are treated the same.
 */
function cleanHtml(html: string): string {
    return cleanEditorHtml(cleanHeadings(html));
}

function splitHtml(html: string): string[] {
    const cleaned = cleanHtml(html);
    return cleaned.split(CHAPTER_SPLIT_PATTERN).filter(p => p.trim().length > 0);
}

function parseChapters(html: string, isLargeBook: boolean) {
    const cleaned = cleanHtml(html);
    const parts = cleaned.split(CHAPTER_SPLIT_PATTERN);

    return parts
        .filter(content => content.trim().length > 0)
        .map((content, index) => {
            // Never drop a part: chapters[] must stay 1:1 with the split parts,
            // otherwise sidebar indices write edits into the wrong chapter.
            const { title, level, hrTag } = classifyChapterPart(content, index);
            if (isLargeBook) {
                return { title, content: '', level, hrTag, _size: content.length };
            }
            return { title, content, level, hrTag };
        });
}

// Message handler
self.onmessage = (e: MessageEvent) => {
    const { type, payload, id } = e.data;

    try {
        let result;

        switch (type) {
            case 'cleanHtml':
                result = cleanHtml(payload.html);
                break;

            case 'splitHtml':
                result = splitHtml(payload.html);
                break;

            case 'parseChapters':
                result = parseChapters(payload.html, payload.isLargeBook || false);
                break;

            case 'mergeChapter': {
                const { fullHtml, chapterIndex, chapterContent } = payload;
                const parts = splitHtml(fullHtml);
                if (parts[chapterIndex] !== undefined) {
                    parts[chapterIndex] = chapterContent;
                }
                result = cleanHtml(parts.join(''));
                break;
            }

            default:
                throw new Error(`Unknown message type: ${type}`);
        }

        self.postMessage({ id, result, error: null });
    } catch (error) {
        self.postMessage({
            id,
            result: null,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};
