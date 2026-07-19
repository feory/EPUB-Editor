import { useRef, useEffect, useCallback } from 'react';

// Worker message types
type WorkerMessage = {
    type: 'cleanHtml' | 'splitHtml' | 'parseChapters' | 'mergeChapter';
    payload: any;
    id: string;
};

type WorkerResponse = {
    id: string;
    result: any;
    error: string | null;
};

type PendingRequest = {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
};

/**
 * Hook to use Web Worker for heavy content processing operations
 * Automatically falls back to main thread if Worker is not available
 */
export function useContentWorker() {
    const workerRef = useRef<Worker | null>(null);
    const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
    const requestIdCounter = useRef(0);

    // Initialize worker
    useEffect(() => {
        try {
            // Create worker from separate file
            workerRef.current = new Worker(
                new URL('../workers/content.worker.ts', import.meta.url),
                { type: 'module' }
            );

            // Handle messages from worker
            workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
                const { id, result, error } = e.data;
                const pending = pendingRequestsRef.current.get(id);

                if (pending) {
                    if (error) {
                        pending.reject(new Error(error));
                    } else {
                        pending.resolve(result);
                    }
                    pendingRequestsRef.current.delete(id);
                }
            };

            workerRef.current.onerror = (error) => {
                console.error('[Worker] Error:', error);
                // Reject all pending requests
                pendingRequestsRef.current.forEach(({ reject }) => {
                    reject(new Error('Worker error'));
                });
                pendingRequestsRef.current.clear();
            };

            console.log('[Worker] Content worker initialized');
        } catch (error) {
            console.warn('[Worker] Failed to initialize, will use main thread fallback:', error);
        }

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
                console.log('[Worker] Content worker terminated');
            }
        };
    }, []);

    const postMessage = useCallback((type: WorkerMessage['type'], payload: any): Promise<any> => {
        return new Promise((resolve, reject) => {
            if (!workerRef.current) {
                reject(new Error('Worker not available'));
                return;
            }

            const id = `${Date.now()}-${requestIdCounter.current++}`;
            const timeoutId = setTimeout(() => {
                if (pendingRequestsRef.current.has(id)) {
                    pendingRequestsRef.current.get(id)!.reject(new Error('Worker timeout'));
                    pendingRequestsRef.current.delete(id);
                }
            }, 30000);

            pendingRequestsRef.current.set(id, {
                resolve: (value: any) => { clearTimeout(timeoutId); resolve(value); },
                reject: (err: Error) => { clearTimeout(timeoutId); reject(err); },
            });

            workerRef.current.postMessage({ type, payload, id });
        });
    }, []);

    // API methods
    const cleanHtml = useCallback(async (html: string): Promise<string> => {
        try {
            return await postMessage('cleanHtml', { html });
        } catch (error) {
            console.warn('[Worker] cleanHtml failed, using fallback');
            throw error;
        }
    }, [postMessage]);

    const splitHtml = useCallback(async (html: string): Promise<string[]> => {
        try {
            return await postMessage('splitHtml', { html });
        } catch (error) {
            console.warn('[Worker] splitHtml failed, using fallback');
            throw error;
        }
    }, [postMessage]);

    const parseChapters = useCallback(async (html: string, isLargeBook: boolean): Promise<any[]> => {
        try {
            return await postMessage('parseChapters', { html, isLargeBook });
        } catch (error) {
            console.warn('[Worker] parseChapters failed, using fallback');
            throw error;
        }
    }, [postMessage]);

    const mergeChapter = useCallback(async (
        fullHtml: string,
        chapterIndex: number,
        chapterContent: string
    ): Promise<string> => {
        try {
            return await postMessage('mergeChapter', { fullHtml, chapterIndex, chapterContent });
        } catch (error) {
            console.warn('[Worker] mergeChapter failed, using fallback');
            throw error;
        }
    }, [postMessage]);

    return {
        cleanHtml,
        splitHtml,
        parseChapters,
        mergeChapter,
        isAvailable: workerRef.current !== null
    };
}
