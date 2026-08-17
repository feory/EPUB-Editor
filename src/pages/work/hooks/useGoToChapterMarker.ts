import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { CHAPTER_SPLIT_PATTERN } from '../../../utils/html-cleaner';
import type { WorkEditorRef } from '../components/WorkEditor';

/**
 * Salta para um marcador (`data-*`) que só existe no DOM do capítulo ATIVO (editor carrega
 * capítulos um a um) — usado por PDF (folio) e Galeria (imagem): tenta o scroll no capítulo
 * aberto; sem match, localiza o capítulo dono via `fullHtmlContent`, muda para lá, e o scroll
 * real corre depois de montar (useEffect em `activeChapterIndex`).
 */
export function useGoToChapterMarker<T>(
    editorRef: RefObject<WorkEditorRef | null>,
    fullHtmlContent: string,
    activeChapterIndex: number,
    setActiveChapterIndex: (index: number) => void,
    marker: (value: T) => string,
    scrollTo: (editor: WorkEditorRef, value: T) => boolean,
): (value: T) => boolean {
    const pendingRef = useRef<T | null>(null);

    const goTo = useCallback((value: T): boolean => {
        if (editorRef.current && scrollTo(editorRef.current, value)) return true;
        const needle = marker(value);
        const parts = fullHtmlContent.split(CHAPTER_SPLIT_PATTERN).filter(p => p.trim().length > 0);
        const chapterIndex = parts.findIndex(p => p.includes(needle));
        if (chapterIndex === -1) return false;
        pendingRef.current = value;
        setActiveChapterIndex(chapterIndex);
        return true;
    }, [editorRef, fullHtmlContent, setActiveChapterIndex, marker, scrollTo]);

    // ponytail: timeout fixo (depois do reset de scroll/cursor do próprio WorkEditor, que já usa
    // 100ms) em vez de um sinal de "capítulo montado" — se um capítulo muito grande demorar mais
    // que isto a renderizar no TinyMCE, o scroll falha silenciosamente.
    useEffect(() => {
        const pending = pendingRef.current;
        if (pending == null) return;
        pendingRef.current = null;
        const t = setTimeout(() => { if (editorRef.current) scrollTo(editorRef.current, pending); }, 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChapterIndex]);

    return goTo;
}
