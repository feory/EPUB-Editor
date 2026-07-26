import { useState, useRef, useEffect, useMemo, useCallback, startTransition } from 'react';
import type React from 'react';
import {
    cleanHeadings,
    CHAPTER_SPLIT_PATTERN,
    CHAPTER_MARKER_COUNT_PATTERN,
    classifyChapterPart,
} from '../../../utils/html-cleaner';
import { replaceChapterContent } from './contentReducer';
import type { ContentState, ContentAction } from './contentReducer';

type ChapterPart = { title: string; content: string; level: 'h1' | 'h2' | 'break'; hrTag?: string; _size?: number };

export function useChapterSync(
    contentState: ContentState,
    dispatch: React.Dispatch<ContentAction>,
    skipSyncRef: React.MutableRefObject<boolean>
) {
    const { fullHtml, activeChapterIndex } = contentState;

    const cleanHtmlCacheRef = useRef<{ html: string; cleaned: string } | null>(null);
    const splitCacheRef = useRef<{ html: string; parts: string[] } | null>(null);

    const cleanHtmlCached = useCallback((html: string): string => {
        if (cleanHtmlCacheRef.current?.html === html) return cleanHtmlCacheRef.current.cleaned;
        const cleaned = cleanHeadings(html);
        cleanHtmlCacheRef.current = { html, cleaned };
        return cleaned;
    }, []);

    const splitHtmlIntoParts = useCallback((html: string): string[] => {
        if (splitCacheRef.current?.html === html) return splitCacheRef.current.parts;
        const parts = html.split(CHAPTER_SPLIT_PATTERN).filter(p => p.trim().length > 0);
        splitCacheRef.current = { html, parts };
        return parts;
    }, []);

    const isLargeBook = useMemo(() => fullHtml.length > 500 * 1024, [fullHtml.length]);

    const chapters = useMemo<ChapterPart[]>(() => {
        if (!fullHtml) return [];
        const cleanedHtml = cleanHtmlCached(fullHtml);
        const parts = cleanedHtml.split(CHAPTER_SPLIT_PATTERN);
        return parts
            .filter(content => content.trim().length > 0)
            .map((content, index) => {
                // Never drop a part: chapters[] must stay 1:1 with the split parts,
                // otherwise sidebar indices write edits into the wrong chapter.
                const { title, level, hrTag } = classifyChapterPart(content, index);
                return isLargeBook
                    ? { title, content: '', level, hrTag, _size: content.length }
                    : { title, content, level, hrTag };
            });
    }, [fullHtml, isLargeBook, cleanHtmlCached]);

    const currentEditorContent = useMemo(() => {
        if (activeChapterIndex === -1) return fullHtml;
        const cleanedHtml = cleanHtmlCached(fullHtml);
        const parts = splitHtmlIntoParts(cleanedHtml);
        return parts[activeChapterIndex] || '';
    }, [fullHtml, activeChapterIndex, cleanHtmlCached, splitHtmlIntoParts]);

    const getSyncedHtmlContent = useCallback(() => cleanHtmlCached(fullHtml), [fullHtml, cleanHtmlCached]);

    // Refs so changeActiveChapter can flush pending edits without depending on
    // content state (callback stays stable per keystroke — sidebar memoization).
    const localContentRef = useRef('');
    const syncedContentRef = useRef('');

    // Livro completo INCLUINDO a edição que ainda está presa no debounce (800/1500ms).
    // getSyncedHtmlContent deriva só do fullHtml, logo devolvia conteúdo antigo a quem grava:
    // escrever e carregar em Guardar (ou sair) dentro da janela do debounce não gravava nada.
    const getLatestHtmlContent = useCallback(() => {
        const pending = localContentRef.current;
        if (skipSyncRef.current || pending === syncedContentRef.current) return cleanHtmlCached(fullHtml);
        if (!pending && activeChapterIndex === -1) return cleanHtmlCached(fullHtml); // vazio transitório
        return replaceChapterContent(fullHtml, pending, activeChapterIndex) ?? cleanHtmlCached(fullHtml);
    }, [fullHtml, activeChapterIndex, cleanHtmlCached, skipSyncRef]);

    const changeActiveChapter = useCallback((index: number) => {
        if (index === activeChapterIndex) return;
        // Flush edits still inside the debounce window to THIS chapter before
        // switching, otherwise they are lost (timer cleared) or, worse, written
        // into the destination chapter (duplicated chapters).
        if (!skipSyncRef.current && localContentRef.current !== syncedContentRef.current) {
            dispatch({ type: 'UPDATE_CONTENT', content: localContentRef.current, chapterIndex: activeChapterIndex });
        }
        if (isLargeBook) dispatch({ type: 'SET_LOADING', loading: true });
        startTransition(() => dispatch({ type: 'CHANGE_CHAPTER', index }));
    }, [activeChapterIndex, isLargeBook, dispatch, skipSyncRef]);

    const [localEditorContent, setLocalEditorContent] = useState(currentEditorContent);

    useEffect(() => {
        setLocalEditorContent(currentEditorContent);
        localContentRef.current = currentEditorContent;
        syncedContentRef.current = currentEditorContent;
    }, [currentEditorContent]);

    const handleEditorChange = useCallback((newContent: string) => {
        localContentRef.current = newContent;
        setLocalEditorContent(newContent);
    }, []);

    // Debounced sync: local editor content → reducer.
    // Larger documents use a longer debounce to reduce regex frequency / jank.
    useEffect(() => {
        if (skipSyncRef.current) return;
        // Vazio só é aceite dentro de um capítulo (apagar o texto todo de um capítulo é
        // legítimo e antes nunca chegava ao reducer). Em "Documento Completo" continua
        // bloqueado: aí um vazio é sempre transitório (editor ainda sem conteúdo) e
        // aplicá-lo apagaria o livro inteiro.
        if (!localEditorContent && activeChapterIndex === -1) return;

        const debounceMs = localEditorContent.length > 500_000 ? 1500 : 800;
        const timer = setTimeout(() => {
            if (skipSyncRef.current) return;

            if (activeChapterIndex !== -1) {
                // A chapter part begins with its own marker; a 2nd marker means a new chapter was created mid-edit
                const markerCount = (localEditorContent.match(CHAPTER_MARKER_COUNT_PATTERN) || []).length;
                if (markerCount > 1) {
                    dispatch({ type: 'UPDATE_CONTENT', content: localEditorContent, chapterIndex: activeChapterIndex });
                    syncedContentRef.current = localEditorContent;
                    startTransition(() => dispatch({ type: 'CHANGE_CHAPTER', index: activeChapterIndex + 1 }));
                    return;
                }
            }
            dispatch({ type: 'UPDATE_CONTENT', content: localEditorContent, chapterIndex: activeChapterIndex });
            syncedContentRef.current = localEditorContent;
        }, debounceMs);

        return () => clearTimeout(timer);
    }, [localEditorContent, activeChapterIndex, dispatch, skipSyncRef]);

    // Reset active chapter if it goes out of bounds
    useEffect(() => {
        if (activeChapterIndex !== -1 && activeChapterIndex >= chapters.length) {
            dispatch({ type: 'CHANGE_CHAPTER', index: -1 });
        }
    }, [chapters.length, activeChapterIndex, dispatch]);

    return {
        chapters,
        localEditorContent,
        handleEditorChange,
        isLargeBook,
        getSyncedHtmlContent,
        getLatestHtmlContent,
        changeActiveChapter,
        splitHtmlIntoParts,
    };
}
