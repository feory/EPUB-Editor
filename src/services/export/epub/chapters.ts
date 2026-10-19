import type { Section } from './types';
import { splitChapterSegments, matchChapterBoundary, classifyChapterPart, stripHidden, untitled } from '../../../utils/chapters';

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

    // O nível e o título vêm de classifyChapterPart (a mesma regra da barra lateral do editor): quebra plana, hr
    // legacy e parte sem marcador são h1; só `[hidden]` é quebra escondida do índice.
    // The marker — not the heading — is the boundary; it is editor-only and stripped from the exported body.
    splitChapterSegments(processedContent).forEach((part) => {
        let content = part.trim();
        if (content.length === 0) return;

        const idx = sections.length;
        const { title: rawTitle, level } = classifyChapterPart(content, idx);
        const boundary = matchChapterBoundary(content);
        if (boundary) content = content.slice(boundary.raw.length).trim();
        const title = stripHidden(rawTitle) || untitled(idx);
        // Sem nível explícito (quebra plana / hr / sem marcador) o corpo pode ficar vazio: não deixar o ficheiro vazio.
        const body = !boundary?.level && content.length === 0 ? '<p>&#160;</p>' : content;

        if (level === 'break') {
            sections.push({ title, content: relocateFootnotes(body), level, parentIdx: currentH1Idx, childIndices: [], hiddenFromToc: true });
            if (currentH1Idx >= 0) sections[currentH1Idx].childIndices.push(idx);
        } else if (level === 'h1') {
            sections.push({ title, content: relocateFootnotes(body), level, parentIdx: -1, childIndices: [] });
            currentH1Idx = idx;
        } else {
            sections.push({ title, content: relocateFootnotes(body), level, parentIdx: currentH1Idx, childIndices: [] });
            if (currentH1Idx >= 0) sections[currentH1Idx].childIndices.push(idx);
        }
    });

    if (sections.length === 0) {
        sections.push({ title: 'Início', content: processedContent, level: 'h1', parentIdx: -1, childIndices: [] });
    }

    return sections;
}
