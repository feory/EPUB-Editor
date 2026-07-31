import { useState, useRef, useEffect, useCallback, useReducer } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ebooksApi } from '../../api/ebooks-api';
import { getAccessToken, clientId } from '../../api/client';
import { useNotification } from '../../context/NotificationContext';
import { useStyles } from '../../context/StyleContext';
import type { ImageSettings } from '../../components/MarginPreview';
import { useContentWorker } from '../../hooks/useContentWorker';
import { compressHtml, decompressHtml } from '../../utils/compression';
import { cleanEditorHtml, applyDropCapToFirstParagraph } from '../../utils/html-cleaner';
import type { ImportOptions } from '../../utils/html-cleaner';
import { moveChapters, renameChapterPart, deleteChapterPart, changeChapterLevel } from '../../utils/toc';
import { linkIndiceEntries } from '../../utils/indice-links';
import type { DocxStyleMapping } from '../../services/document-importer';
import { insertPageBreaks } from '../../services/page-list';
import type { PageAnchor } from '../../services/page-list';

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
    // Conteúdo que o servidor já tem, NA FORMA que o save envia (cleanHeadings do fullHtml).
    // Comparar com o texto cru guardado dava sempre diferente (o load normaliza), e cada save
    // escreve uma versão nova no histórico — abrir e sair sem editar poluía o histórico.
    const savedContentRef = useRef<string | null>(null);

    const saveMutation = useMutation({
        mutationFn: ({ content, showNotif }: { content: string; showNotif?: boolean }) =>
            ebooksApi.saveContent(isbn!, compressHtml(content)),
        onSuccess: (_, variables) => {
            savedContentRef.current = variables.content;
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
    // Gravar usa SEMPRE o getter "latest" (inclui a edição ainda presa no debounce) — não o
    // getSyncedHtmlContent, que só vê o que já passou pelo reducer.
    const getSyncedRef = useRef(chapterSync.getLatestHtmlContent);
    getSyncedRef.current = chapterSync.getLatestHtmlContent;
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

    // Linha de base do "por gravar": primeira forma sincronizada logo após o LOAD_CONTENT
    // (é exatamente o que um save enviaria nesse instante → abrir e sair sem editar não grava).
    useEffect(() => {
        if (savedContentRef.current === null && contentState.fullHtml) {
            savedContentRef.current = getSyncedRef.current();
        }
    }, [contentState.fullHtml]);

    // Sair do editor não gravava: a seta de voltar faz navigate('/') e o autosave é de 5 em 5
    // minutos — perdia-se tudo o que fosse escrito depois do último save (ou a sessão inteira,
    // se durasse menos de 5 min).
    const readOnlyRef = useRef(readOnly);
    readOnlyRef.current = readOnly;

    const pendingContent = useCallback(() => {
        if (readOnlyRef.current || !isbn) return null;
        const content = getSyncedRef.current();
        if (!content || content === savedContentRef.current) return null;
        return content;
    }, [isbn]);

    // Saída dentro da app (voltar, ebook concluído, troca de rota).
    useEffect(() => () => {
        const content = pendingContent();
        if (!content || !isbn) return;
        // Chamada direta à API, não a mutation: no unmount o observer do react-query já
        // não corre os callbacks, mas o pedido axios segue à mesma. Como o onSuccess da
        // mutation não corre, o cache de ['ebook-content'] (staleTime: Infinity) tem de ser
        // reposto aqui — senão reentrar no editor dentro do gcTime recarregava o texto ANTIGO,
        // apesar de o servidor já ter o novo.
        ebooksApi.saveContent(isbn, compressHtml(content))
            .then(() => {
                queryClient.setQueryData(['ebook-content', isbn], { content, source: 'saved' });
                queryClient.invalidateQueries({ queryKey: ['ebook-history', isbn] });
            })
            .catch(() => {
                // Falhou: não deixar o cache a afirmar o que não está gravado — força releitura.
                queryClient.invalidateQueries({ queryKey: ['ebook-content', isbn] });
            });
    }, [pendingContent, isbn, queryClient]);

    // Fechar/recarregar o separador: keepalive porque o pedido tem de sobreviver à página.
    // sendBeacon não serve — não deixa pôr o cabeçalho Authorization.
    useEffect(() => {
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            const content = pendingContent();
            if (!content || !isbn) return;
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
            e.preventDefault(); // browser avisa que há alterações por gravar
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [pendingContent, isbn]);

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

    // Grava conteúdo NOVO do livro inteiro no reducer + mantém o capítulo ativo (LOAD_CONTENT
    // põe activeChapterIndex a -1; restaurar a entrada onde estava) + autosave. Partilhado pelas
    // transformações de livro inteiro que substituem o fullHtml de uma vez (título de capítulo,
    // capitulares, page-list) — reorder/delete de capítulo NÃO usam isto: index deixa de ser
    // válido depois de mover/eliminar, restaurar seria a posição errada.
    const commitHtml = useCallback((html: string) => {
        const prevIndex = contentState.activeChapterIndex;
        dispatch({ type: 'LOAD_CONTENT', payload: html });
        if (prevIndex !== -1) dispatch({ type: 'CHANGE_CHAPTER', index: prevIndex });
        if (isbn) saveMutation.mutate({ content: html });
    }, [isbn, saveMutation, contentState.activeChapterIndex]);

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
        commitHtml(updatedHtml);
        showNotification('success', 'Título do capítulo atualizado!');
    }, [chapterSync, commitHtml, showNotification]);

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

    // --- Mudar nível de um capítulo (h1/h2/h3/break) ---
    const handleChangeChapterLevel = useCallback((index: number, level: 'h1' | 'h2' | 'h3' | 'break') => {
        const { chapters, parts } = getChaptersAndParts();
        if (!chapters[index] || chapters[index].level === level) return;
        const updatedPart = changeChapterLevel(parts[index], level);
        if (updatedPart === parts[index]) return;
        parts[index] = updatedPart;
        const updatedHtml = parts.join('');
        commitHtml(updatedHtml);
        showNotification('success', 'Nível do capítulo atualizado!');
    }, [getChaptersAndParts, commitHtml, showNotification]);

    // --- Eliminar capítulo (subárvore h1+filhos; folhas isoladas) ---
    const handleDeleteChapter = useCallback((index: number) => {
        const { chapters, parts, levels } = getChaptersAndParts();
        if (!chapters[index]) return;
        const updatedHtml = deleteChapterPart(parts, levels, index);
        dispatch({ type: 'LOAD_CONTENT', payload: updatedHtml });
        showNotification('success', `Capítulo ${chapters[index].title} eliminado!`);
        if (isbn) saveMutation.mutate({ content: updatedHtml });
    }, [getChaptersAndParts, isbn, saveMutation, showNotification]);

    // --- Criar capítulo novo (sempre como primeiro) ---
    const handleAddChapter = useCallback(() => {
        const { parts } = getChaptersAndParts();
        const newPart = `${changeChapterLevel('<p class="chapter-break" data-title="Novo Capítulo"></p>', 'h1')}<p></p>`;
        const updatedHtml = [newPart, ...parts].join('');
        dispatch({ type: 'LOAD_CONTENT', payload: updatedHtml });
        showNotification('success', 'Capítulo criado!');
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
        commitHtml(updatedHtml);
        showNotification('success', `${applied} ${applied === 1 ? 'capitular aplicada' : 'capitulares aplicadas'}${already > 0 ? `, ${already} já ${already === 1 ? 'tinha' : 'tinham'}` : ''}.`);
    }, [chapterSync, commitHtml, showNotification]);

    // --- Ligar entradas do Índice do livro aos capítulos correspondentes (livro inteiro) ---
    const handleLinkIndiceEntries = useCallback(() => {
        const syncedHtml = chapterSync.getSyncedHtmlContent();
        const parts = chapterSync.splitHtmlIntoParts(syncedHtml);
        const { parts: updatedParts, linked, anchored } = linkIndiceEntries(parts);
        const updatedHtml = updatedParts.join('');
        if (updatedHtml === syncedHtml) {
            showNotification('info', 'Nenhum Índice encontrado, ou nenhuma entrada correspondeu a um capítulo.');
            return;
        }
        commitHtml(updatedHtml);
        showNotification('success', `${linked} ${linked === 1 ? 'entrada ligada' : 'entradas ligadas'} a ${anchored} ${anchored === 1 ? 'capítulo' : 'capítulos'}.`);
    }, [chapterSync, commitHtml, showNotification]);

    // PDF carregado DEPOIS do import (o zip IDML não tinha PDF, ou o import é antigo) — gera a
    // page-list agora, sobre o livro já importado. anchors já vêm calculados de PrintPdfSidebar
    // (que já corre extractPdfPageAnchors para o mapa de sync scroll↔PDF — evita fazer o parsing
    // do PDF duas vezes). insertPageBreaks remove marcadores antigos antes de inserir.
    const handleGeneratePageList = useCallback((anchors: PageAnchor[]) => {
        const syncedHtml = chapterSync.getSyncedHtmlContent();
        const { html: updatedHtml, inserted, total } = insertPageBreaks(syncedHtml, anchors);
        if (inserted === 0) {
            showNotification('info', 'Nenhuma página do PDF foi encontrada no texto do livro.');
            return;
        }
        commitHtml(updatedHtml);
        showNotification('success', `Page-list: ${inserted} de ${total} páginas marcadas.`);
    }, [chapterSync, commitHtml, showNotification]);

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
                saveMutation.mutate({ content: chapterSync.getLatestHtmlContent(), showNotif: true });
            },
            [saveMutation, chapterSync.getLatestHtmlContent, readOnly]
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
        handleLinkIndiceEntries,
        handleGeneratePageList,

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
