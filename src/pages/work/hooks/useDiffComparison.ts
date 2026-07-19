import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';
import type { DiffItem } from '../../../workers/diff.worker';
import type { WorkEditorRef } from '../components/WorkEditor';
import { useNotification } from '../../../context/NotificationContext';
import { extractParagraphs } from '../../../utils/diff-text';

interface UseDiffComparisonOptions {
    htmlContent: string;
    editorRef: React.RefObject<WorkEditorRef | null>;
    onOpen: () => void;
}

export function useDiffComparison({ htmlContent, editorRef, onOpen }: UseDiffComparisonOptions) {
    const { showNotification } = useNotification();
    const [showDiffSidebar, setShowDiffSidebar] = useState(false);
    const [diffItems, setDiffItems] = useState<DiffItem[]>([]);
    const [diffFileName, setDiffFileName] = useState('');
    const [isDiffLoading, setIsDiffLoading] = useState(false);
    const [isDiffUpdating, setIsDiffUpdating] = useState(false);
    const diffWorkerRef = useRef<Worker | null>(null);
    const refParagraphsRef = useRef<string[]>([]);
    const diffDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showDiffSidebarRef = useRef(false);
    const diffIdCounterRef = useRef(0);

    useEffect(() => {
        diffWorkerRef.current = new Worker(
            new URL('../../../workers/diff.worker.ts', import.meta.url),
            { type: 'module' },
        );
        return () => { diffWorkerRef.current?.terminate(); diffWorkerRef.current = null; };
    }, []);

    const runDiff = useCallback(async (editorParagraphs: string[], refParas: string[]) => {
        if (!diffWorkerRef.current) throw new Error('Worker não disponível');
        const id = `diff-${++diffIdCounterRef.current}`;
        const worker = diffWorkerRef.current;
        const result = await new Promise<DiffItem[]>((resolve, reject) => {
            const timeout = setTimeout(() => {
                worker.removeEventListener('message', handler);
                reject(new Error('Diff worker timeout'));
            }, 30000);
            const handler = (e: MessageEvent) => {
                if (e.data.id !== id) return;
                clearTimeout(timeout);
                worker.removeEventListener('message', handler);
                if (e.data.error) reject(new Error(e.data.error));
                else resolve(e.data.result);
            };
            worker.addEventListener('message', handler);
            worker.postMessage({ type: 'diff', payload: { editorParagraphs, refParagraphs: refParas }, id });
        });
        setDiffItems(result);
        // Only highlight if sidebar is still open (race guard)
        if (showDiffSidebarRef.current) {
            editorRef.current?.highlightDiffContent(result);
        }
    }, [editorRef]);

    const handleCompareFile = useCallback(async (file: File) => {
        setDiffFileName(file.name);
        setIsDiffLoading(true);
        setShowDiffSidebar(true);
        showDiffSidebarRef.current = true;
        editorRef.current?.clearDiffHighlights();
        onOpen();

        try {
            let refText = '';
            const nameLower = file.name.toLowerCase();
            if (nameLower.endsWith('.docx') || nameLower.endsWith('.doc')) {
                const mammoth = await import('mammoth');
                const buffer = await file.arrayBuffer();
                const result = await mammoth.extractRawText({ arrayBuffer: buffer });
                refText = result.value;
            } else if (nameLower.endsWith('.pdf')) {
                const pdfjsLib = await import('pdfjs-dist');
                pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
                const buffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
                const pages: string[] = [];
                for (let p = 1; p <= pdf.numPages; p++) {
                    const page = await pdf.getPage(p);
                    const content = await page.getTextContent();
                    // Use hasEOL to emit paragraph breaks; items without EOL join with space
                    pages.push(content.items.map(item => {
                        if (!('str' in item)) return '';
                        const ti = item as { str: string; hasEOL?: boolean };
                        return ti.str + (ti.hasEOL ? '\n' : ' ');
                    }).join(''));
                }
                refText = pages.join('\n');
            } else {
                refText = await file.text();
            }
            refParagraphsRef.current = refText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0);
            await runDiff(extractParagraphs(htmlContent), refParagraphsRef.current);
        } catch (err) {
            console.error('Diff error:', err);
            showNotification('error', 'Erro ao comparar ficheiros.');
            setShowDiffSidebar(false);
            showDiffSidebarRef.current = false;
        } finally {
            setIsDiffLoading(false);
        }
    }, [htmlContent, showNotification, runDiff, editorRef, onOpen]);

    useEffect(() => {
        if (!showDiffSidebar || isDiffLoading || refParagraphsRef.current.length === 0) return;
        if (diffDebounceRef.current) clearTimeout(diffDebounceRef.current);
        diffDebounceRef.current = setTimeout(async () => {
            setIsDiffUpdating(true);
            try {
                await runDiff(extractParagraphs(htmlContent), refParagraphsRef.current);
            } catch (err) {
                console.error('Auto-diff error:', err);
            } finally {
                setIsDiffUpdating(false);
            }
        }, 1500);
        return () => { if (diffDebounceRef.current) clearTimeout(diffDebounceRef.current); };
    }, [htmlContent, showDiffSidebar, isDiffLoading, runDiff]);

    const closeDiffSidebar = useCallback(() => {
        setShowDiffSidebar(false);
        showDiffSidebarRef.current = false;
        editorRef.current?.clearDiffHighlights();
    }, [editorRef]);

    return {
        showDiffSidebar,
        diffItems,
        diffFileName,
        isDiffLoading,
        isDiffUpdating,
        handleCompareFile,
        closeDiffSidebar,
    };
}
