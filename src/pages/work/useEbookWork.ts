import { useState, useRef, useEffect, useMemo, useCallback, useReducer } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ebooksApi } from '../../api/ebooks-api';
import { useNotification } from '../../context/NotificationContext';
import { useStyles } from '../../context/StyleContext';
import type { ImageSettings } from '../../components/MarginPreview';
import { useContentWorker } from '../../hooks/useContentWorker';
import { compressHtml, decompressHtml } from '../../utils/compression';
import { cleanEditorHtml, applyDropCapToFirstParagraph } from '../../utils/html-cleaner';
import type { ImportOptions } from '../../utils/html-cleaner';
import { moveChapters, renameChapterPart, deleteChapterPart } from '../../utils/toc';
import type { DocxStyleMapping } from '../../services/document-importer';

import { contentReducer, initialContentState } from './hooks/contentReducer';
import { useChapterSync } from './hooks/useChapterSync';
import { useEbookImport } from './hooks/useEbookImport';
import { useEbookExport } from './hooks/useEbookExport';
import { useEbookValidation } from './hooks/useEbookValidation';
import { useEbookHistory } from './hooks/useEbookHistory';
import { useVersionDiff } from './hooks/useVersionDiff';
import { useEbookGrammar } from './hooks/useEbookGrammar';
import { usePresence } from './hooks/usePresence';

export function useEbookWork(isbn: string | undefined) {
    const queryClient = useQueryClient();
    const { showNotification, hideNotification } = useNotification();
    const { customCss } = useStyles();
    useContentWorker(); // kept for side effects / future use

    const [contentState, dispatch] = useReducer(contentReducer, initialContentState);
    const skipSyncRef = useRef(false);
    const initializedRef = useRef(false);

    // --- Chapter sync (local editor content ↔ reducer, chapters list, undo/redo) ---
    const chapterSync = useChapterSync(contentState, dispatch, skipSyncRef);

    // --- Presence / edit-lock (2º utilizador = só leitura, nunca grava) ---
    const presence = usePresence(isbn);
    const readOnly = presence.readOnly;

    // --- Ebook metadata ---
    const { data: ebook } = useQuery({
        queryKey: ['ebook', isbn],
        queryFn: async () => (await ebooksApi.get(isbn!)).data.data,
        enabled: !!isbn,
    });

    // --- Initial content load ---
    const { data: contentData, isLoading: isLoadingContent } = useQuery({
        queryKey: ['ebook-content', isbn],
        queryFn: async () => {
            try {
                const response = await ebooksApi.getContent(isbn!);
                return { content: decompressHtml(response.data.content), source: 'saved' as const };
            } catch {
                return { content: '', source: 'none' as const };
            }
        },
        enabled: !!isbn,
        staleTime: Infinity,
    });

    useEffect(() => {
        if (contentData?.content && !initializedRef.current) {
            dispatch({ type: 'LOAD_CONTENT', payload: cleanEditorHtml(contentData.content) });
            initializedRef.current = true;
        }
    }, [contentData]);

    // --- Save ---
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    const saveMutation = useMutation({
        mutationFn: ({ content, showNotif }: { content: string; showNotif?: boolean }) =>
            ebooksApi.saveContent(isbn!, compressHtml(content)),
        onSuccess: (_, variables) => {
            queryClient.setQueryData(['ebook-content', isbn], { content: variables.content, source: 'saved' });
            setLastSaved(new Date());
            queryClient.invalidateQueries({ queryKey: ['ebook-history', isbn] });
            if (variables.showNotif) showNotification('success', 'Guardado com sucesso!');
        },
        onError: (_, variables) => {
            console.error('[Autosave] Erro ao guardar');
            if (variables.showNotif) showNotification('error', 'Erro ao guardar o trabalho.');
        },
    });

    // Autosave every 5 minutes via stable refs
    const getSyncedRef = useRef(chapterSync.getSyncedHtmlContent);
    getSyncedRef.current = chapterSync.getSyncedHtmlContent;
    const saveMutRef = useRef(saveMutation);
    saveMutRef.current = saveMutation;

    useEffect(() => {
        if (!isbn) return;
        if (readOnly) return; // modo leitura: nunca grava
        const interval = setInterval(() => {
            const content = getSyncedRef.current();
            if (content && !saveMutRef.current.isPending) {
                saveMutRef.current.mutate({ content, showNotif: false });
            }
        }, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [isbn, readOnly]);

    // --- Import ---
    const onImport = useCallback((html: string) => {
        dispatch({ type: 'LOAD_CONTENT', payload: html });
        saveMutation.mutate({ content: html });
    }, [saveMutation]);

    const { importPdfMutation, importDocumentMutation } = useEbookImport({ isbn, onImport, showNotification });

    // --- Export & Preview ---
    const exportHook = useEbookExport({
        isbn,
        ebook,
        getSyncedHtmlContent: chapterSync.getSyncedHtmlContent,
        customCss,
        showNotification,
    });

    // --- Validation ---
    const validation = useEbookValidation({
        isbn,
        getSyncedHtmlContent: chapterSync.getSyncedHtmlContent,
        prepareEpubAssets: exportHook.prepareEpubAssets,
        customCss,
        showNotification,
        hideNotification,
    });

    // --- History ---
    const history = useEbookHistory({ isbn, dispatch, queryClient, skipSyncRef, showNotification });

    // --- Diff entre dois saves ---
    const versionDiff = useVersionDiff(isbn);

    // --- Grammar ---
    const grammar = useEbookGrammar({ isbn });

    // --- Edit chapter title (break, h1 e h2) ---
    const handleEditChapterTitle = useCallback((chapterIndex: number, newTitle: string) => {
        const chapter = chapterSync.chapters[chapterIndex];
        if (!chapter) return;

        const syncedHtml = chapterSync.getSyncedHtmlContent();
        const parts = chapterSync.splitHtmlIntoParts(syncedHtml);
        if (!parts[chapterIndex]) return;

        const updatedPart = renameChapterPart(parts[chapterIndex], newTitle);
        if (updatedPart === parts[chapterIndex]) return; // sem alteração (marcador não encontrado)
        parts[chapterIndex] = updatedPart;
        const updatedHtml = parts.join('');
        const prevIndex = contentState.activeChapterIndex; // LOAD_CONTENT põe a -1; restaurar a entrada onde estava
        dispatch({ type: 'LOAD_CONTENT', payload: updatedHtml });
        if (prevIndex !== -1) dispatch({ type: 'CHANGE_CHAPTER', index: prevIndex });
        showNotification('success', 'Título do capítulo atualizado!');
        if (isbn) saveMutation.mutate({ content: updatedHtml });
    }, [chapterSync, isbn, saveMutation, showNotification, contentState.activeChapterIndex]);

    // Setup partilhado por operações estruturais (reorder/delete): capítulos + parts do split + níveis.
    const getChaptersAndParts = useCallback(() => {
        const chapters = chapterSync.chapters;
        const parts = chapterSync.splitHtmlIntoParts(chapterSync.getSyncedHtmlContent());
        const levels = chapters.map(c => c.level);
        return { chapters, parts, levels };
    }, [chapterSync]);

    // --- Reorder chapters (subárvore h1+filhos; folhas isoladas) ---
    const handleReorderChapter = useCallback((from: number, to: number) => {
        const { chapters, parts, levels } = getChaptersAndParts();
        if (!chapters[from] || from === to) return;
        const updatedHtml = moveChapters(parts, levels, from, to);
        if (updatedHtml === parts.join('')) return; // no-op (soltar dentro da própria subárvore)
        dispatch({ type: 'LOAD_CONTENT', payload: updatedHtml });
        showNotification('success', `Capítulo ${chapters[from].title} movido!`);
        if (isbn) saveMutation.mutate({ content: updatedHtml });
    }, [getChaptersAndParts, isbn, saveMutation, showNotification]);

    // --- Eliminar capítulo (subárvore h1+filhos; folhas isoladas) ---
    const handleDeleteChapter = useCallback((index: number) => {
        const { chapters, parts, levels } = getChaptersAndParts();
        if (!chapters[index]) return;
        const updatedHtml = deleteChapterPart(parts, levels, index);
        dispatch({ type: 'LOAD_CONTENT', payload: updatedHtml });
        showNotification('success', `Capítulo ${chapters[index].title} eliminado!`);
        if (isbn) saveMutation.mutate({ content: updatedHtml });
    }, [getChaptersAndParts, isbn, saveMutation, showNotification]);

    // --- Aplicar capitular ao 1º parágrafo real de cada capítulo (livro inteiro) ---
    const handleApplyDropCaps = useCallback(() => {
        const syncedHtml = chapterSync.getSyncedHtmlContent();
        const parts = chapterSync.splitHtmlIntoParts(syncedHtml);
        let applied = 0, already = 0;
        const updatedParts = parts.map((p) => {
            const r = applyDropCapToFirstParagraph(p);
            if (r.status === 'applied') applied++;
            else if (r.status === 'already') already++;
            return r.part;
        });
        const updatedHtml = updatedParts.join('');
        if (updatedHtml === syncedHtml) {
            showNotification('info', already > 0
                ? `Todos os capítulos já tinham capitular (${already}).`
                : 'Nenhum capítulo elegível para capitular.');
            return;
        }
        const prevIndex = contentState.activeChapterIndex;
        dispatch({ type: 'LOAD_CONTENT', payload: updatedHtml });
        if (prevIndex !== -1) dispatch({ type: 'CHANGE_CHAPTER', index: prevIndex });
        showNotification('success', `${applied} ${applied === 1 ? 'capitular aplicada' : 'capitulares aplicadas'}${already > 0 ? `, ${already} já ${already === 1 ? 'tinha' : 'tinham'}` : ''}.`);
        if (isbn) saveMutation.mutate({ content: updatedHtml });
    }, [chapterSync, isbn, saveMutation, showNotification, contentState.activeChapterIndex]);

    // --- Return public API (identical shape to original) ---
    return {
        status: ebook?.status,
        htmlContent: chapterSync.localEditorContent,
        setHtmlContent: chapterSync.handleEditorChange,
        fullHtmlContent: contentState.fullHtml,

        undo: chapterSync.handleUndo,
        redo: chapterSync.handleRedo,
        canUndo: contentState.past.length > 0,
        canRedo: contentState.future.length > 0,

        title: ebook?.title || '',
        author: ebook?.author || '',
        description: ebook?.description || '',
        publisher: ebook?.publisher || '',
        language: ebook?.language || 'pt',
        subjects: ebook?.subjects || '',
        pub_date: ebook?.pub_date || '',

        isLoading:
            isLoadingContent ||
            importPdfMutation.isPending ||
            importDocumentMutation.isPending ||
            saveMutation.isPending ||
            exportHook.isPreviewing,
        isLoadingChapter: contentState.isLoadingChapter,
        isLargeBook: chapterSync.isLargeBook,
        lastSaved,

        readOnly,
        presence,

        saveContent: useCallback(
            () => {
                if (readOnly) return; // modo leitura: nunca grava
                saveMutation.mutate({ content: chapterSync.getSyncedHtmlContent(), showNotif: true });
            },
            [saveMutation, chapterSync.getSyncedHtmlContent, readOnly]
        ),

        showHistory: history.isHistoryOpen,
        setShowHistory: history.setIsHistoryOpen,
        historyFiles: history.historyFiles,
        epubFiles: history.epubFiles,
        fetchHistory: history.fetchHistory,
        loadHistoryFile: history.handleLoadHistory,
        downloadEpubFile: history.handleDownloadEpub,
        refetchHistory: history.refetchHistory,
        versionDiff,

        validationResults: validation.validationResults,
        setValidationResults: validation.setValidationResults,
        footnoteValidation: validation.footnoteValidation,
        setFootnoteValidation: validation.setFootnoteValidation,
        linkValidation: validation.linkValidation,
        setLinkValidation: validation.setLinkValidation,
        isValidating: validation.isValidating,
        handleValidate: validation.handleValidate,
        handleValidateEpub: validation.handleValidateEpub,
        handleValidateAccessibility: validation.handleValidateAccessibility,
        handleValidateLinks: validation.handleValidateLinks,

        grammarIssues: grammar.grammarIssues,
        setGrammarIssues: grammar.setGrammarIssues,
        grammarCache: grammar.grammarCache,
        handleSaveGrammar: grammar.handleSaveGrammar,
        handleResolveIssue: grammar.handleResolveIssue,
        handleResolveMultiple: grammar.handleResolveMultiple,

        handleEditChapterTitle,
        handleReorderChapter,
        handleDeleteChapter,
        handleApplyDropCaps,

        handleImportPdf: useCallback(
            (file: File, h: number, f: number, settings: ImageSettings, options: ImportOptions) =>
                importPdfMutation.mutate({ file, headerMargin: h, footerMargin: f, imageSettings: settings, options }),
            [importPdfMutation]
        ),
        handleImportDocument: useCallback(
            (file: File, options: ImportOptions, styleMapping?: DocxStyleMapping) =>
                importDocumentMutation.mutate({ file, options, styleMapping }),
            [importDocumentMutation]
        ),

        handleExportEpub: exportHook.handleExport,
        handlePreview: exportHook.handlePreview,
        previewBlob: exportHook.previewBlob,
        closePreview: exportHook.closePreview,

        chapters: chapterSync.chapters,
        activeChapterIndex: contentState.activeChapterIndex,
        setActiveChapterIndex: chapterSync.changeActiveChapter,

        stats: useMemo(() => {
            const text = contentState.fullHtml.replace(/<[^>]*>/g, ' ');
            const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
            const estimatedPages = Math.ceil(words / 250);
            return {
                words,
                chars: text.length,
                chapterCount: chapterSync.chapters.length,
                estimatedPages,
            };
        }, [contentState.fullHtml, chapterSync.chapters.length]),
    };
}
