import React from 'react';
import { useEbookRow } from './ebookRow';
import { ImageIcon, Settings, Check, X, Loader2, Trash2, Download, RotateCcw, Share2 } from 'lucide-react';
import type { Ebook } from '../../api/ebooks-api';

interface EbookCompactProps {
    ebooks: Ebook[];
    onNavigate?: (isbn: string) => void;
    onOpenMetadata?: (e: React.MouseEvent, ebook: Ebook) => void;
    onOpenCover?: (e: React.MouseEvent, ebook: Ebook) => void;
    onComplete?: (e: React.MouseEvent, ebook: Ebook) => void;
    onShare?: (e: React.MouseEvent, ebook: Ebook) => void;
    onDelete?: (isbn: string) => void;
    isDeleting?: boolean;
    coverVersions?: Record<string, number>;
    onDownloadEpub: (isbn: string) => Promise<void>;
    onReopen?: (e: React.MouseEvent, ebook: Ebook) => void;
    emptyMessage?: string;
}

export const EbookCompact: React.FC<EbookCompactProps> = ({
    ebooks, onNavigate, onOpenMetadata, onOpenCover, onComplete, onShare, onDelete, isDeleting, onDownloadEpub, onReopen, emptyMessage,
}) => {
    const row = useEbookRow();

    if (ebooks.length === 0) {
        return <div className="flex-1 flex items-center justify-center text-text-muted italic">{emptyMessage ?? 'Sem ebooks.'}</div>;
    }

    return (
        <div className="divide-y divide-border">
            {ebooks.map((ebook) => {
                const isInProgress = ebook.status !== 'completed';
                return (
                    <div
                        key={ebook.ebook_isbn}
                        className={`group flex items-center gap-3 px-4 py-2 hover:bg-slate-50/80 transition-colors ${isInProgress && onNavigate ? 'cursor-pointer' : ''}`}
                        onClick={() => isInProgress && onNavigate?.(ebook.ebook_isbn)}
                    >
                        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono text-slate-400 shrink-0 hidden sm:inline-block w-36 text-center">{ebook.ebook_isbn}</code>
                        <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm text-text-muted group-hover:text-text-main transition-colors truncate block">{ebook.title}</span>
                            <span className="text-xs text-text-muted truncate block">{ebook.author}</span>
                        </div>
                        <div className="flex gap-1 items-center shrink-0" onClick={e => e.stopPropagation()}>
                            {isInProgress ? (
                                <>
                                    {row.idle(ebook.ebook_isbn) && (
                                        <>
                                            <button
                                                className="p-1.5 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-40"
                                                title="Descarregar EPUB"
                                                disabled={row.downloading(ebook.ebook_isbn)}
                                                onClick={async (e) => { e.stopPropagation(); await row.download(ebook.ebook_isbn, onDownloadEpub); }}>
                                                {row.downloading(ebook.ebook_isbn) ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                            </button>
                                            {onOpenMetadata && (
                                                <button
                                                    className="p-1.5 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                                    onClick={(e) => { row.cancel(); onOpenMetadata(e, ebook); }}
                                                    title="Editar Metadados">
                                                    <Settings size={13} />
                                                </button>
                                            )}
                                            {onOpenCover && (
                                                <button
                                                    className="p-1.5 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                                    onClick={(e) => { row.cancel(); onOpenCover(e, ebook); }}
                                                    title="Gerir Capa">
                                                    <ImageIcon size={13} />
                                                </button>
                                            )}
                                        </>
                                    )}
                                    {row.idle(ebook.ebook_isbn) && onShare && (
                                        <button className="p-1.5 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                            onClick={(e) => { e.stopPropagation(); onShare(e, ebook); }} title="Partilhar">
                                            <Share2 size={13} />
                                        </button>
                                    )}
                                    {!row.deleting(ebook.ebook_isbn) && onComplete && (
                                        row.confirming(ebook.ebook_isbn) ? (
                                            <div className="flex items-center gap-1">
                                                <button className="p-1.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                                                    onClick={(e) => { onComplete(e, ebook); row.cancel(); }} title="Confirmar conclusão">
                                                    <Check size={13} />
                                                </button>
                                                <button className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                    onClick={(e) => { e.stopPropagation(); row.cancel(); }} title="Cancelar">
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button className="p-1.5 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                                onClick={(e) => { e.stopPropagation(); row.askComplete(ebook.ebook_isbn); }} title="Concluir">
                                                <Check size={13} />
                                            </button>
                                        )
                                    )}
                                    {onDelete && (
                                        row.deleting(ebook.ebook_isbn) ? (
                                            <div className="flex items-center gap-1">
                                                <button className="p-1.5 rounded bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
                                                    onClick={(e) => { e.stopPropagation(); onDelete(ebook.ebook_isbn); row.cancel(); }}
                                                    disabled={isDeleting} title="Confirmar eliminação">
                                                    {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                                </button>
                                                <button className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                    onClick={(e) => { e.stopPropagation(); row.cancel(); }} title="Cancelar">
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        ) : !row.confirming(ebook.ebook_isbn) ? (
                                            <button className="p-1.5 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                                onClick={(e) => { e.stopPropagation(); row.askDelete(ebook.ebook_isbn); }} title="Eliminar registo">
                                                <Trash2 size={13} />
                                            </button>
                                        ) : null
                                    )}
                                </>
                            ) : (
                                <>
                                    <button
                                        className="p-1.5 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-40"
                                        title="Descarregar EPUB"
                                        disabled={row.downloading(ebook.ebook_isbn)}
                                        onClick={async (e) => { e.stopPropagation(); await row.download(ebook.ebook_isbn, onDownloadEpub); }}>
                                        {row.downloading(ebook.ebook_isbn) ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                    </button>
                                    {onReopen && (
                                        <button className="p-1.5 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                            onClick={(e) => onReopen(e, ebook)} title="Reabrir">
                                            <RotateCcw size={13} />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
