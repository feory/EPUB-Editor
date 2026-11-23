import { useCallback } from 'react';
import type { RefObject } from 'react';
import { splitChapters } from '../../../utils/chapters';
import { extractParagraphs } from '../../../utils/diff-text';
import { locateParagraph } from './chapterJump';
import type { WorkEditorRef } from '../components/WorkEditor';

/**
 * Salta para o parágrafo N do LIVRO INTEIRO (índice de `extractParagraphs(fullHtml)`, como o diff
 * de versões). O editor só tem o capítulo ativo, e `scrollToParagraph` indexa os parágrafos desse
 * capítulo → converte para (capítulo, índice local); se for outro capítulo, muda e o scroll real
 * corre quando o editor acaba a troca (`afterChapterChange`).
 */
export function useGoToParagraph(
    editorRef: RefObject<WorkEditorRef | null>,
    fullHtmlContent: string,
    activeChapterIndex: number,
    setActiveChapterIndex: (index: number) => void,
): (globalIndex: number) => void {
    const goTo = useCallback((globalIndex: number) => {
        const at = locateParagraph(splitChapters(fullHtmlContent), globalIndex, (part) => extractParagraphs(part).length);
        if (!at) return;
        if (at.chapter === activeChapterIndex) editorRef.current?.scrollToParagraph(at.local);
        else {
            editorRef.current?.afterChapterChange(() => editorRef.current?.scrollToParagraph(at.local));
            setActiveChapterIndex(at.chapter);
        }
    }, [editorRef, fullHtmlContent, activeChapterIndex, setActiveChapterIndex]);

    return goTo;
}
