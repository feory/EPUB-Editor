import React, { useState } from 'react';
import { useEbookRow, deleteLabels, ebookMenuItems } from './ebookRow';
import { ImageIcon, Check, X, Loader2, Trash2, Download, RotateCcw, Info } from 'lucide-react';
import type { Ebook } from '../../api/ebooks-api';
import { MetadataViewModal } from './CompletedTable';
import { OverflowMenu } from '../../components/OverflowMenu';

interface EbookGridProps {
    ebooks: Ebook[];
    onNavigate?: (isbn: string) => void;
    onOpenMetadata?: (e: React.MouseEvent, ebook: Ebook) => void;
    onOpenCover?: (e: React.MouseEvent, ebook: Ebook) => void;
    onComplete?: (e: React.MouseEvent, ebook: Ebook) => void;
    onShare?: (e: React.MouseEvent, ebook: Ebook) => void;
    onDelete?: (isbn: string) => void;
    ownerLabel?: (ebook: Ebook) => string | null;   // "Partilhado por X" / "De X" (null = é meu)
    isShared?: (ebook: Ebook) => boolean;   // partilhado comigo (não sou o dono): o botão remove a partilha em vez de eliminar
    isDeleting?: boolean;
    coverVersions?: Record<string, number>;
    onDownloadEpub: (isbn: string) => Promise<void>;
    onReopen?: (e: React.MouseEvent, ebook: Ebook) => void;
    emptyMessage?: string;
}

export const EbookGrid: React.FC<EbookGridProps> = ({
    ebooks, onNavigate, onOpenMetadata, onOpenCover, onComplete, onShare, onDelete, isShared, ownerLabel, isDeleting, coverVersions, onDownloadEpub, onReopen, emptyMessage,
}) => {
    const row = useEbookRow();
    const [viewingEbook, setViewingEbook] = useState<Ebook | null>(null);

    if (ebooks.length === 0) {
        return <div className="flex-1 flex items-center justify-center text-text-muted italic">{emptyMessage ?? 'Sem ebooks.'}</div>;
    }

    return (
        <div className="p-4 grid grid-cols-5 auto-rows-fr gap-4">
            {ebooks.map((ebook) => {
                const isInProgress = ebook.status !== 'completed';
                return (
                    <div key={ebook.ebook_isbn} className="group flex flex-col w-full bg-white rounded-xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                        {/* Cover */}
                        <div
                            className={`relative w-full bg-slate-100 flex items-center justify-center ${isInProgress && onNavigate ? 'cursor-pointer' : ''}`}
                            style={{ aspectRatio: '3/4' }}
                            onClick={() => isInProgress && onNavigate?.(ebook.ebook_isbn)}
                        >
                            <img
                                src={`/api/ebooks/${ebook.ebook_isbn}/cover?t=${coverVersions?.[ebook.ebook_isbn] ?? ebook.created_at}`}
                                alt=""
                                loading="lazy"
                                className="w-full h-full object-contain"
                                onLoad={(e) => { e.currentTarget.style.display = ''; const s = e.currentTarget.nextElementSibling as HTMLElement | null; if (s) s.style.display = 'none'; }}
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                            <ImageIcon size={24} className="absolute text-slate-300 pointer-events-none" />
                        </div>
                        {/* Info */}
                        <div className="flex flex-col flex-1 px-3 pt-2 pb-1 gap-0.5">
                            <p className="font-semibold text-base text-text-muted group-hover:text-text-main transition-colors truncate leading-tight">{ebook.title}</p>
                            <p className="text-xs text-text-muted truncate">{ebook.author}</p>
                            {ownerLabel?.(ebook) && <p className="text-[11px] text-text-muted truncate" title={ownerLabel(ebook)!}>{ownerLabel(ebook)}</p>}
                        </div>
                        {/* Actions */}
                        <div className="px-3 pb-3 pt-1 flex gap-1" onClick={e => e.stopPropagation()}>
                            {isInProgress ? (
                                <>
                                    {row.idle(ebook.ebook_isbn) && (
                                        <button
                                            className="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-40"
                                            title="Descarregar EPUB"
                                            disabled={row.downloading(ebook.ebook_isbn)}
                                            onClick={async (e) => { e.stopPropagation(); await row.download(ebook.ebook_isbn, onDownloadEpub); }}>
                                            {row.downloading(ebook.ebook_isbn) ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                        </button>
                                    )}
                                    {!row.deleting(ebook.ebook_isbn) && onComplete && (
                                        row.confirming(ebook.ebook_isbn) ? (
                                            <>
                                                <button className="flex-1 flex items-center justify-center p-2 rounded bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                                                    onClick={(e) => { onComplete(e, ebook); row.cancel(); }} title="Confirmar conclusão">
                                                    <Check size={14} />
                                                </button>
                                                <button className="flex-1 flex items-center justify-center p-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                    onClick={(e) => { e.stopPropagation(); row.cancel(); }} title="Cancelar">
                                                    <X size={14} />
                                                </button>
                                            </>
                                        ) : (
                                            <button className="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                                onClick={(e) => { e.stopPropagation(); row.askComplete(ebook.ebook_isbn); }} title="Concluir">
                                                <Check size={14} />
                                            </button>
                                        )
                                    )}
                                    {onDelete && (
                                        row.deleting(ebook.ebook_isbn) ? (
                                            <>
                                                <button className="flex-1 flex items-center justify-center p-2 rounded bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
                                                    onClick={(e) => { e.stopPropagation(); onDelete(ebook.ebook_isbn); row.cancel(); }}
                                                    disabled={isDeleting} title={deleteLabels(!!isShared?.(ebook)).confirm}>
                                                    {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                </button>
                                                <button className="flex-1 flex items-center justify-center p-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                    onClick={(e) => { e.stopPropagation(); row.cancel(); }} title="Cancelar">
                                                    <X size={14} />
                                                </button>
                                            </>
                                        ) : !row.confirming(ebook.ebook_isbn) ? (
                                            <button className="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                                onClick={(e) => { e.stopPropagation(); row.askDelete(ebook.ebook_isbn); }} title={deleteLabels(!!isShared?.(ebook)).ask}>
                                                <Trash2 size={14} />
                                            </button>
                                        ) : null
                                    )}
                                    {row.idle(ebook.ebook_isbn) && (onOpenMetadata || onOpenCover || (onShare && !isShared?.(ebook))) && (
                                        <OverflowMenu
                                            iconSize={14}
                                            direction="up"
                                            buttonClassName="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                            items={ebookMenuItems(ebook, !!isShared?.(ebook), { onOpenMetadata, onOpenCover, onShare })}
                                        />
                                    )}
                                </>
                            ) : (
                                <>
                                    <button
                                        className="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                        title="Metadados"
                                        onClick={(e) => { e.stopPropagation(); setViewingEbook(ebook); }}>
                                        <Info size={14} />
                                    </button>
                                    <button
                                        className="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-40"
                                        title="Descarregar EPUB"
                                        disabled={row.downloading(ebook.ebook_isbn)}
                                        onClick={async (e) => { e.stopPropagation(); await row.download(ebook.ebook_isbn, onDownloadEpub); }}>
                                        {row.downloading(ebook.ebook_isbn) ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                    </button>
                                    {onReopen && (
                                        <button className="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                            onClick={(e) => onReopen(e, ebook)} title="Reabrir">
                                            <RotateCcw size={14} />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
            {viewingEbook && <MetadataViewModal ebook={viewingEbook} onClose={() => setViewingEbook(null)} />}
        </div>
    );
};
