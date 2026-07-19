import { useState, useRef, useEffect, useCallback } from 'react';
import type { DiffItem } from '../../../workers/diff.worker';
import type { HistoryFile } from '../../../api/ebooks-api';
import { ebooksApi } from '../../../api/ebooks-api';
import { decompressHtml } from '../../../utils/compression';
import { extractParagraphs } from '../../../utils/diff-text';
import { useNotification } from '../../../context/NotificationContext';

/**
 * Diff entre o CONTEÚDO ATUAL do editor e um ficheiro do histórico (save). Isolado do editor:
 * worker próprio, sem highlight no DOM (evita o caveat dos spans `delete`). Resultado read-only
 * no DiffSidebar. Lado A (editor/insert=verde) = ATUAL; lado B (ref/delete=rose) = histórico →
 * verde = adicionado desde o histórico, rose = removido.
 */
export function useVersionDiff(isbn: string | undefined) {
    const { showNotification } = useNotification();
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [diffItems, setDiffItems] = useState<DiffItem[]>([]);
    const [labels, setLabels] = useState<{ history: string } | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const idCounterRef = useRef(0);

    useEffect(() => {
        workerRef.current = new Worker(
            new URL('../../../workers/diff.worker.ts', import.meta.url),
            { type: 'module' },
        );
        return () => { workerRef.current?.terminate(); workerRef.current = null; };
    }, []);

    const loadHtml = useCallback(async (filename: string): Promise<string> => {
        const res = await ebooksApi.getContent(isbn!, filename);
        return decompressHtml(res.data.content);
    }, [isbn]);

    const runWorker = useCallback((editorParagraphs: string[], refParagraphs: string[]) => {
        const worker = workerRef.current;
        if (!worker) throw new Error('Worker não disponível');
        const id = `vdiff-${++idCounterRef.current}`;
        return new Promise<DiffItem[]>((resolve, reject) => {
            const timeout = setTimeout(() => { worker.removeEventListener('message', handler); reject(new Error('Diff worker timeout')); }, 30000);
            const handler = (e: MessageEvent) => {
                if (e.data.id !== id) return;
                clearTimeout(timeout);
                worker.removeEventListener('message', handler);
                if (e.data.error) reject(new Error(e.data.error));
                else resolve(e.data.result);
            };
            worker.addEventListener('message', handler);
            worker.postMessage({ type: 'diff', payload: { editorParagraphs, refParagraphs }, id });
        });
    }, []);

    const compareWithEditor = useCallback(async (file: HistoryFile, editorHtml: string) => {
        if (!isbn) return;
        setOpen(true);
        setIsLoading(true);
        setDiffItems([]);
        setLabels({ history: file.timestamp });
        try {
            const historyHtml = await loadHtml(file.filename);
            // editor = atual (insert/verde = adicionado), ref = histórico (delete/rose = removido)
            const result = await runWorker(extractParagraphs(editorHtml), extractParagraphs(historyHtml));
            setDiffItems(result);
        } catch (err) {
            console.error('Version diff error:', err);
            showNotification('error', 'Erro ao comparar com o histórico.');
            setOpen(false);
        } finally {
            setIsLoading(false);
        }
    }, [isbn, loadHtml, runWorker, showNotification]);

    const close = useCallback(() => setOpen(false), []);

    return { open, isLoading, diffItems, labels, compareWithEditor, close };
}
