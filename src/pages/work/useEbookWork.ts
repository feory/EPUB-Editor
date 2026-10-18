import { useState, useRef, useEffect, useCallback, useMemo, useReducer } from 'react';
import type { RefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { ebooksApi } from '../../api/ebooks-api';
import { getAccessToken, clientId } from '../../api/client';
import { useNotification } from '../../context/NotificationContext';
import { useStyles } from '../../context/StyleContext';
import type { ImageSettings } from '../../components/MarginPreview';
import { compressHtml, compressHtmlAsync, decompressHtml } from '../../utils/compression';
import { cleanEditorHtml } from '../../utils/html-cleaner';
import type { ImportOptions } from '../../utils/html-cleaner';
import { drafts } from '../../utils/local-draft';
import type { Draft } from '../../utils/local-draft';
import { listSubtitles } from '../../utils/indice-links';
import type { DocxStyleMapping } from '../../services/import/document-importer';
import type { PageAnchor } from '../../services/page-list/page-list';

import { createSaver } from './saver';
import * as bookEdit from './bookEdit';
import type { Book, BookEdit, Level } from './bookEdit';
import { contentReducer, initialContentState } from './hooks/contentReducer';
import { useChapterSync } from './hooks/useChapterSync';
import { useEbookImport } from './hooks/useEbookImport';
import { useEbookExport } from './hooks/useEbookExport';
import { useEbookValidation } from './hooks/useEbookValidation';
import { useEbookHistory } from './hooks/useEbookHistory';
import { useVersionDiff } from './hooks/useVersionDiff';
import { useEbookGrammar } from './hooks/useEbookGrammar';
import { usePresence } from './hooks/usePresence';
import type { WorkEditorRef } from './components/WorkEditor';

// Fechar/recarregar o separador: keepalive porque o pedido tem de sobreviver à página.
// sendBeacon não serve — não deixa pôr o cabeçalho Authorization.
function sendOnUnload(isbn: string, content: string) {
    const token = getAccessToken();
    fetch(`/api/ebooks/${isbn}/content`, {
        method: 'POST',
        keepalive: true,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': clientId,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: compressHtml(content) }),
    }).catch(() => { /* a página está a fechar */ });
}

export function useEbookWork(isbn: string | undefined, editorRef?: RefObject<WorkEditorRef | null>) {
    const queryClient = useQueryClient();
    const { showNotification, hideNotification } = useNotification();
    const { customCss } = useStyles();

    const [contentState, dispatch] = useReducer(contentReducer, initialContentState);
    const skipSyncRef = useRef(false);
    const initializedRef = useRef(false);

    // --- Chapter sync (local editor content ↔ reducer, chapters list, undo/redo) ---
    // editorRef é estável → flushEditor também (deps dos callbacks do useChapterSync).
    const flushEditor = useCallback(() => editorRef?.current?.flushContent(), [editorRef]);
    const chapterSync = useChapterSync(contentState, dispatch, skipSyncRef, flushEditor);

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
            } catch (err) {
                // 404 = livro genuinamente sem conteúdo gravado ainda (caso normal, "source: none").
                // Qualquer outro erro (rede, timeout, 5xx) tem de propagar — engoli-lo aqui fazia
                // cache permanente (staleTime: Infinity) de um resultado "vazio" falso-positivo,
                // sem retry, só corrigível com reload da página inteira.
                if (isAxiosError(err) && err.response?.status === 404) {
                    return { content: '', source: 'none' as const };
                }
                throw err;
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

    // --- Save --- (regras no saver.ts; aqui só se liga ao React, à cache e às notificações)
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    // Gravar usa SEMPRE o getter "latest" (inclui a edição ainda presa no debounce) — não o
    // getSyncedHtmlContent, que só vê o que já passou pelo reducer.
    const { getLatestHtmlContent } = chapterSync;
    const latestRef = useRef(getLatestHtmlContent);
    const readOnlyRef = useRef(readOnly);
    useEffect(() => {
        latestRef.current = getLatestHtmlContent;
        readOnlyRef.current = readOnly;
    });

    // As refs só são lidas dentro dos callbacks do saver (efeitos/eventos), nunca no render.
    // eslint-disable-next-line react-hooks/refs
    const saver = useMemo(() => !isbn ? null : createSaver({
        isbn,
        getContent: () => latestRef.current(),
        send: async (content) => { await ebooksApi.saveContent(isbn, await compressHtmlAsync(content)); },
        sendOnUnload: (content) => sendOnUnload(isbn, content),
        drafts,
        readOnly: () => readOnlyRef.current,
        onBusy: setIsSaving,
        onSaved: (content, notify) => {
            // Cache a staleTime: Infinity — sem isto reentrar no editor recarregava o texto antigo.
            queryClient.setQueryData(['ebook-content', isbn], { content, source: 'saved' });
            setLastSaved(new Date());
            queryClient.invalidateQueries({ queryKey: ['ebook-history', isbn] });
            if (notify) showNotification('success', 'Guardado com sucesso!');
        },
        onFailed: (notify, exit) => {
            if (exit) { // sem UI para avisar: não deixar a cache a afirmar o que não está gravado
                queryClient.invalidateQueries({ queryKey: ['ebook-content', isbn] });
                return;
            }
            console.error('[Autosave] Erro ao guardar');
            // O rascunho local já tem este texto; o autosave seguinte (ou a rede de volta) tenta de novo.
            showNotification('error', notify
                ? 'Erro ao guardar o trabalho. Cópia guardada neste computador.'
                : 'Sem ligação ao servidor — cópia guardada neste computador.', 6000);
        },
    }), [isbn, queryClient, showNotification]);

    const save = useCallback((content: string, notify = false) => { void saver?.save(content, notify); }, [saver]);

    useEffect(() => saver?.start(), [saver]);

    useEffect(() => {
        if (!saver) return;
        const onOnline = () => void saver.onOnline();
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [saver]);

    // Sair do editor (voltar, ebook concluído, troca de rota): gravar o que ficou por gravar.
    useEffect(() => () => { saver?.exit('app'); }, [saver]);

    // Fechar/recarregar o separador: keepalive; o browser avisa que há alterações por gravar.
    useEffect(() => {
        const onBeforeUnload = (e: BeforeUnloadEvent) => { if (saver?.exit('unload')) e.preventDefault(); };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [saver]);

    // Texto assentou: linha de base (1.ª vez), rascunho local e oferta de recuperação (1.ª vez).
    useEffect(() => {
        if (!saver || !contentState.fullHtml) return;
        saver.baseline();
        saver.contentChanged();
        void saver.checkDraft().then((d) => { if (d) setDraft(d); });
    }, [saver, contentState.fullHtml, readOnly]);

    // --- Import ---
    const onImport = useCallback((html: string) => {
        dispatch({ type: 'LOAD_CONTENT', payload: html });
        save(html);
    }, [save]);

    const restoreDraft = useCallback(() => {
        if (!draft || readOnly) return;
        saver?.resolveDraft(true);
        onImport(cleanEditorHtml(draft.html)); // carrega + grava; o save confirmado apaga o rascunho
        setDraft(null);
    }, [draft, readOnly, saver, onImport]);

    const discardDraft = useCallback(() => {
        saver?.resolveDraft(false);
        setDraft(null);
    }, [saver]);

    const { importPdfMutation, importDocumentMutation } = useEbookImport({ isbn, onImport, showNotification });

    // --- Export & Preview ---
    const exportHook = useEbookExport({
        isbn,
        ebook,
        getLatestHtmlContent, // inclui a edição ainda no debounce — exportar/validar com o texto antigo era o bug
        customCss,
        showNotification,
    });

    // --- Validation ---
    const validation = useEbookValidation({
        isbn,
        getLatestHtmlContent, // inclui a edição ainda no debounce — exportar/validar com o texto antigo era o bug
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

    // Grava conteúdo NOVO do livro inteiro no reducer + mantém o capítulo ativo (LOAD_CONTENT
    // põe activeChapterIndex a -1; restaurar a entrada onde estava) + autosave. Partilhado pelas
    // transformações de livro inteiro que substituem o fullHtml de uma vez (título de capítulo,
    // capitulares, page-list) — reorder/delete de capítulo NÃO usam isto: index deixa de ser
    // válido depois de mover/eliminar, restaurar seria a posição errada.
    const commitHtml = useCallback((html: string) => {
        const prevIndex = contentState.activeChapterIndex;
        // Sincroniza o editor DIRETAMENTE (dom.setHTML + undoManager.add(), ver
        // syncExternalContent em WorkEditor.tsx) antes do dispatch — devolve o fullHtml com o
        // segmento aberto RESERIALIZADO pelo TinyMCE, para bater certo com o que o wrapper
        // (@tinymce/tinymce-react) vai comparar no próximo render e não chamar setContent()
        // por baixo (que LIMPA a pilha de undo inteira). Guardamos SEMPRE esse html
        // (reconciliado), nunca o `html` cru recebido — é o que fica persistido.
        const syncedHtml = editorRef?.current?.syncExternalContent(html, prevIndex) ?? html;
        dispatch({ type: 'LOAD_CONTENT', payload: syncedHtml });
        if (prevIndex !== -1) dispatch({ type: 'CHANGE_CHAPTER', index: prevIndex });
        if (isbn) save(syncedHtml);
    }, [isbn, save, contentState.activeChapterIndex, editorRef]);

    // --- Edição do livro (bookEdit.ts decide o quê; aqui só se aplica e se avisa) ---
    const getBook = useCallback((): Book => {
        const html = chapterSync.getLatestHtmlContent();
        return { html, parts: chapterSync.splitHtmlIntoParts(html), chapters: chapterSync.chapters };
    }, [chapterSync]);

    const applyEdit = useCallback((edit: BookEdit | null) => {
        if (!edit) return;
        if (edit.html !== undefined) {
            if (edit.commit === 'keep') commitHtml(edit.html);
            else {
                dispatch({ type: 'LOAD_CONTENT', payload: edit.html });
                if (isbn) save(edit.html);
            }
        }
        if (edit.notice) showNotification(edit.notice.type, edit.notice.text);
    }, [commitHtml, isbn, save, showNotification]);

    const handleEditChapterTitle = useCallback((chapterIndex: number, newTitle: string) =>
        applyEdit(bookEdit.renameChapter(getBook(), chapterIndex, newTitle)), [applyEdit, getBook]);
    const handleReorderChapter = useCallback((from: number, to: number) =>
        applyEdit(bookEdit.moveChapter(getBook(), from, to)), [applyEdit, getBook]);
    const handleChangeChapterLevel = useCallback((index: number, level: Level) =>
        applyEdit(bookEdit.changeLevel(getBook(), index, level)), [applyEdit, getBook]);
    const handleDeleteChapter = useCallback((index: number) =>
        applyEdit(bookEdit.deleteChapter(getBook(), index)), [applyEdit, getBook]);
    const handleAddChapter = useCallback(() => applyEdit(bookEdit.addChapter(getBook())), [applyEdit, getBook]);
    const handleRemoveCommentAnchor = useCallback((anchorId: string) =>
        applyEdit(bookEdit.removeCommentAnchor(getBook(), anchorId)), [applyEdit, getBook]);
    const handleApplyDropCaps = useCallback(() => applyEdit(bookEdit.applyDropCaps(getBook())), [applyEdit, getBook]);
    const handleLinkIndiceEntries = useCallback(() => applyEdit(bookEdit.linkIndice(getBook())), [applyEdit, getBook]);
    // Mini-menu do editor ("Ligar a…"): uma entrada, ou null no alvo = remover a ligação.
    const handleLinkIndiceEntryManual = useCallback((pIndex: number, indiceChapterIndex: number, targetChapterIndex: number | null, subIndex?: number) =>
        applyEdit(bookEdit.linkIndiceEntry(getBook(), pIndex, indiceChapterIndex, targetChapterIndex, subIndex)), [applyEdit, getBook]);
    // Lido só ao abrir o dropdown "Ligar a…" (split do livro inteiro — não corre a cada edição).
    const getIndiceSubtitles = useCallback(
        () => listSubtitles(chapterSync.splitHtmlIntoParts(chapterSync.getLatestHtmlContent())),
        [chapterSync],
    );
    const handleFixLinks = useCallback(() => {
        const { edit, report } = bookEdit.fixBookLinks(getBook());
        validation.setLinkValidation(report);
        applyEdit(edit);
    }, [applyEdit, getBook, validation]);
    // PDF carregado DEPOIS do import: anchors já vêm calculados de PrintPdfSidebar.
    const handleGeneratePageList = useCallback((anchors: PageAnchor[]) =>
        applyEdit(bookEdit.generatePageList(getBook(), anchors)), [applyEdit, getBook]);
    // Substituição no LIVRO todo (mini find/replace do editar HTML). getLatest inclui a edição
    // ainda presa no debounce.
    const countInWholeBook = useCallback((find: string): number => bookEdit.countInBook(getBook(), find), [getBook]);
    const handleReplaceInWholeBook = useCallback((find: string, replaceWith: string): number => {
        const { edit, count } = bookEdit.replaceInBook(getBook(), find, replaceWith);
        applyEdit(edit);
        return count;
    }, [applyEdit, getBook]);

    // --- Return public API (identical shape to original) ---
    return {
        status: ebook?.status,
        htmlContent: chapterSync.localEditorContent,
        setHtmlContent: chapterSync.handleEditorChange,
        fullHtmlContent: contentState.fullHtml,

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
            isSaving ||
            exportHook.isPreviewing,
        isLoadingChapter: contentState.isLoadingChapter,
        isLargeBook: chapterSync.isLargeBook,
        lastSaved,

        readOnly,
        presence,
        draft,
        restoreDraft,
        discardDraft,

        saveContent: useCallback(
            () => {
                if (readOnly) return; // modo leitura: nunca grava
                save(getLatestHtmlContent(), true);
            },
            [save, getLatestHtmlContent, readOnly]
        ),
        // Mesmo padrão silencioso de moveChapters/deleteChapterPart/createChapter (showNotif
        // omitido) — para mutações estruturais que persistem de imediato sem ser o botão
        // "Guardar" (ex. apagar um comentário: o toast genérico de guardar não faz sentido aí).
        saveContentSilently: useCallback(
            () => {
                if (readOnly) return;
                save(getLatestHtmlContent());
            },
            [save, getLatestHtmlContent, readOnly]
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
        handleAddChapter,
        handleChangeChapterLevel,
        handleApplyDropCaps,
        handleRemoveCommentAnchor,
        handleLinkIndiceEntries,
        handleLinkIndiceEntryManual,
        getIndiceSubtitles,
        handleFixLinks,
        handleGeneratePageList,
        countInWholeBook,
        handleReplaceInWholeBook,

        handleImportPdf: useCallback(
            (file: File, h: number, f: number, settings: ImageSettings, options: ImportOptions) =>
                importPdfMutation.mutate({ file, headerMargin: h, footerMargin: f, imageSettings: settings, options }),
            [importPdfMutation]
        ),
        handleImportDocument: useCallback(
            (file: File, options: ImportOptions, styleMapping?: DocxStyleMapping, epubClassMapping?: Record<string, string>) =>
                importDocumentMutation.mutate({ file, options, styleMapping, epubClassMapping }),
            [importDocumentMutation]
        ),

        handleExportEpub: exportHook.handleExport,
        handlePreview: exportHook.handlePreview,
        previewBlob: exportHook.previewBlob,
        closePreview: exportHook.closePreview,

        chapters: chapterSync.chapters,
        activeChapterIndex: contentState.activeChapterIndex,
        setActiveChapterIndex: chapterSync.changeActiveChapter,

        // Função, não useMemo: só o modal de Estatísticas lê isto, mas o memo recalculava a
        // cada flush do debounce (strip de tags + contagem sobre o livro inteiro, ~6ms a 1,2MB)
        // mesmo com o modal fechado.
        getStats: useCallback(() => {
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
