import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, FileText, ChevronLeft, ChevronRight, Loader2, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ebooksApi } from '../../../api/ebooks-api';
import { extractPdfPageAnchors } from '../../../services/page-list';

interface PrintPdfSidebarProps {
    isbn: string;
    onClose: () => void;
    syncFolio?: number | null; // folio (nº impresso) visível no editor — salta o viewer para lá
    onPageClick?: (folio: number) => void; // clique na página → editor salta para o marcador
}

type Status = 'loading' | 'missing' | 'ready' | 'error';

const MIN_SCALE = 0.6;
const MAX_SCALE = 3;
const SCALE_STEP = 0.2;

export const PrintPdfSidebar: React.FC<PrintPdfSidebarProps> = ({ isbn, onClose, syncFolio, onPageClick }) => {
    const [status, setStatus] = useState<Status>('loading');
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(0);
    const [scale, setScale] = useState(1.4);
    const [uploading, setUploading] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pdfRef = useRef<PDFDocumentProxy | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // folio impresso (data-page do editor) → página física do PDF; podem divergir por
    // front-matter sem numeração (ver PageAnchor.pdfPageIndex em page-list.ts).
    const folioMapRef = useRef<Map<number, number>>(new Map());
    const indexToFolioRef = useRef<Map<number, number>>(new Map()); // sentido inverso, p/ clique na página

    const loadPdf = useCallback(async () => {
        setStatus('loading');
        try {
            const res = await ebooksApi.getPrintPdf(isbn);
            if (res.status === 404) { setStatus('missing'); return; }
            const buf = res.data as ArrayBuffer;
            const pdfjsLib = await import('pdfjs-dist');
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
            // getDocument neutraliza o ArrayBuffer que recebe — cópias próprias para o proxy
            // do viewer e para extractPdfPageAnchors (também chama getDocument internamente).
            const pdf = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
            pdfRef.current = pdf;
            setPageCount(pdf.numPages);
            setPage(1);
            setStatus('ready');
            const anchors = await extractPdfPageAnchors(buf.slice(0));
            folioMapRef.current = new Map(anchors.map(a => [a.page, a.pdfPageIndex]));
            indexToFolioRef.current = new Map(anchors.map(a => [a.pdfPageIndex, a.page]));
        } catch {
            setStatus('error');
        }
    }, [isbn]);

    useEffect(() => { loadPdf(); }, [loadPdf]);

    // Scroll no editor → salta para a página física correspondente ao folio visível.
    useEffect(() => {
        if (status !== 'ready' || syncFolio == null) return;
        const target = folioMapRef.current.get(syncFolio);
        if (target && target !== page) setPage(target);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncFolio, status]);

    useEffect(() => {
        if (status !== 'ready' || !pdfRef.current || !canvasRef.current) return;
        let cancelled = false;
        (async () => {
            const pdfPage = await pdfRef.current!.getPage(page);
            if (cancelled) return;
            const viewport = pdfPage.getViewport({ scale });
            const canvas = canvasRef.current!;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        })();
        return () => { cancelled = true; };
    }, [status, page, scale]);

    const zoomIn = () => setScale(s => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)));
    const zoomOut = () => setScale(s => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)));

    // Navegação do utilizador (setas ou clique na página) → resolve o folio e reencaminha o
    // editor. Distinto do setPage direto usado pelo sync editor→PDF (evita ping-pong entre os
    // dois sentidos: aquele já chega à página certa, não precisa de voltar a mandar o editor lá).
    const goToPage = (target: number) => {
        setPage(target);
        const folio = indexToFolioRef.current.get(target);
        if (folio != null) onPageClick?.(folio);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setUploading(true);
        try {
            await ebooksApi.uploadPrintPdf(isbn, file);
            await loadPdf();
        } finally {
            setUploading(false);
        }
    };

    return (
        <aside className="fixed right-4 top-[89px] bottom-8 w-[600px] bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border border-border rounded-2xl overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">
            {/* Oculto por omissão, só aparece com o rato na faixa do topo (mesmo truque da
                paginação em baixo) — liberta a altura toda para o PDF. */}
            <div className="absolute top-0 left-0 right-0 z-10 px-5 pt-4 pb-6 bg-gradient-to-b from-white via-white/95 to-transparent flex items-center justify-between opacity-0 hover:opacity-100 transition-opacity duration-300">
                <div className="flex items-center gap-2.5">
                    <FileText size={16} className="text-primary shrink-0" />
                    <h3 className="font-black text-slate-900 text-sm leading-tight">PDF de Impressão</h3>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all shrink-0">
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-50/40 flex flex-col items-center justify-center p-3 pb-0">
                {status === 'loading' && (
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Loader2 size={24} className="animate-spin" />
                        <p className="text-sm font-semibold">A carregar PDF...</p>
                    </div>
                )}
                {status === 'error' && (
                    <p className="text-sm text-rose-500">Erro ao carregar o PDF.</p>
                )}
                {status === 'missing' && (
                    <div className="flex flex-col items-center gap-3 text-slate-400 text-center px-6">
                        <FileText size={28} />
                        <p className="text-sm font-semibold text-slate-600">Sem PDF guardado</p>
                        <p className="text-xs">Carregue o PDF de impressão deste livro para o ver aqui.</p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 h-9 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
                        >
                            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                            Carregar PDF
                        </button>
                        <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={handleUpload} />
                    </div>
                )}
                {status === 'ready' && (
                    <canvas
                        ref={canvasRef}
                        onClick={() => goToPage(page)}
                        title="Ir para esta página no editor"
                        className="shadow-md cursor-pointer"
                    />
                )}

                {/* Paginação: sem espaço próprio (canvas aproveita a altura toda) — oculta por
                    omissão, só aparece com o rato na faixa final do leitor (mesmo truque do
                    toolbar_sticky do editor, ver index.css). opacity-0 mantém pointer-events, por
                    isso o hover dispara mesmo invisível. */}
                {status === 'ready' && (
                    <div className="sticky bottom-0 left-0 right-0 pt-6 pb-3 flex items-center justify-center gap-3 bg-gradient-to-t from-white via-white/95 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
                        {pageCount > 1 && (
                            <>
                                <button onClick={() => goToPage(Math.max(1, page - 1))} disabled={page <= 1} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors">
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="text-xs font-semibold text-slate-600 tabular-nums">{page} / {pageCount}</span>
                                <button onClick={() => goToPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors">
                                    <ChevronRight size={16} />
                                </button>
                                <span className="w-px h-4 bg-slate-200 mx-1" />
                            </>
                        )}
                        <button onClick={zoomOut} disabled={scale <= MIN_SCALE} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors">
                            <ZoomOut size={16} />
                        </button>
                        <span className="text-xs font-semibold text-slate-600 tabular-nums w-10 text-center">{Math.round(scale / 1.4 * 100)}%</span>
                        <button onClick={zoomIn} disabled={scale >= MAX_SCALE} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors">
                            <ZoomIn size={16} />
                        </button>
                    </div>
                )}
            </div>
        </aside>
    );
};
