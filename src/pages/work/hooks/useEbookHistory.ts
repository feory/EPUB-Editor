import { useState, useCallback } from 'react';
import type React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { ebooksApi } from '../../../api/ebooks-api';
import { decompressHtml } from '../../../utils/compression';
import type { ContentAction } from './contentReducer';

interface UseEbookHistoryOptions {
    isbn: string | undefined;
    dispatch: React.Dispatch<ContentAction>;
    queryClient: QueryClient;
    skipSyncRef: React.MutableRefObject<boolean>;
    showNotification: (type: string, message: string) => void;
}

export function useEbookHistory({
    isbn,
    dispatch,
    queryClient,
    skipSyncRef,
    showNotification,
}: UseEbookHistoryOptions) {
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const { data: historyData, refetch: refetchHistory } = useQuery({
        queryKey: ['ebook-history', isbn],
        queryFn: async () => {
            const res = await ebooksApi.getHistory(isbn!);
            return res.data.history;
        },
        enabled: !!isbn && isHistoryOpen,
    });

    const { data: epubHistoryData, refetch: refetchEpubHistory } = useQuery({
        queryKey: ['ebook-epub-history', isbn],
        queryFn: async () => {
            const res = await ebooksApi.getEpubHistory(isbn!);
            return res.data.epubs;
        },
        enabled: !!isbn && isHistoryOpen,
    });

    const handleLoadHistory = useCallback(async (filename: string) => {
        if (!window.confirm('Substituir o trabalho atual por esta versão?')) return;

        try {
            skipSyncRef.current = true;
            setIsHistoryOpen(false);

            const res = await ebooksApi.getContent(isbn!, filename);
            const restoredContent = decompressHtml(res.data.content);

            dispatch({ type: 'LOAD_CONTENT', payload: restoredContent });
            queryClient.setQueryData(['ebook-content', isbn], { content: restoredContent, source: 'saved' });

            setTimeout(() => { skipSyncRef.current = false; }, 2000);

            showNotification('success', 'Versão restaurada com sucesso!');
        } catch (error) {
            skipSyncRef.current = false;
            console.error('Erro ao restaurar versão:', error);
            showNotification('error', 'Erro ao restaurar versão.');
        }
    }, [isbn, dispatch, queryClient, skipSyncRef, showNotification]);

    const handleDownloadEpub = useCallback(async (filename: string) => {
        try {
            const res = await ebooksApi.downloadEpub(isbn!, filename);
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            showNotification('error', 'Erro ao descarregar EPUB.');
        }
    }, [isbn, showNotification]);

    const fetchHistory = useCallback(() => {
        setIsHistoryOpen(true);
        refetchHistory();
        refetchEpubHistory();
    }, [refetchHistory, refetchEpubHistory]);

    return {
        isHistoryOpen,
        setIsHistoryOpen,
        historyFiles: historyData || [],
        epubFiles: epubHistoryData || [],
        fetchHistory,
        refetchHistory, // carregar a lista sem abrir o modal (ex. separador Histórico da Comparação)
        handleLoadHistory,
        handleDownloadEpub,
    };
}
