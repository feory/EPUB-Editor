import { useCallback } from 'react';
import type { RefObject } from 'react';
import { splitChapters } from '../../../utils/chapters';
import type { WorkEditorRef } from '../components/WorkEditor';

/**
 * Salta para um marcador (`data-*`) que só existe no DOM do capítulo ATIVO (editor carrega
 * capítulos um a um) — usado por PDF (folio) e Galeria (imagem): tenta o scroll no capítulo
 * aberto; sem match, localiza o capítulo dono via `fullHtmlContent`, muda para lá, e o scroll
 * real corre quando o editor acaba a troca (`afterChapterChange`).
 */
export function useGoToChapterMarker<T>(
    editorRef: RefObject<WorkEditorRef | null>,
    fullHtmlContent: string,
    setActiveChapterIndex: (index: number) => void,
    marker: (value: T) => string,
    scrollTo: (editor: WorkEditorRef, value: T) => boolean,
): (value: T) => boolean {
    const goTo = useCallback((value: T): boolean => {
        if (editorRef.current && scrollTo(editorRef.current, value)) return true;
        const needle = marker(value);
        const parts = splitChapters(fullHtmlContent);
        const chapterIndex = parts.findIndex(p => p.includes(needle));
        if (chapterIndex === -1) return false;
        editorRef.current?.afterChapterChange(() => { if (editorRef.current) scrollTo(editorRef.current, value); });
        setActiveChapterIndex(chapterIndex);
        return true;
    }, [editorRef, fullHtmlContent, setActiveChapterIndex, marker, scrollTo]);

    return goTo;
}
