import React, { useState } from 'react';
import { ImageIcon, Settings, Check, X, Loader2, Trash2, Download, RotateCcw, Share2, Info } from 'lucide-react';
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
    isDeleting?: boolean;
    coverVersions?: Record<string, number>;
    onDownloadEpub: (isbn: string) => Promise<void>;
    onReopen?: (e: React.MouseEvent, ebook: Ebook) => void;
    emptyMessage?: string;
}

export const EbookGrid: React.FC<EbookGridProps> = ({
    ebooks, onNavigate, onOpenMetadata, onOpenCover, onComplete, onShare, onDelete, isDeleting, coverVersions, onDownloadEpub, onReopen, emptyMessage,
}) => {
    const [confirmingIsbn, setConfirmingIsbn] = useState<string | null>(null);
    const [deletingIsbn, setDeletingIsbn] = useState<string | null>(null);
    const [downloadingIsbn, setDownloadingIsbn] = useState<string | null>(null);
    const [viewingEbook, setViewingEbook] = useState<Ebook | null>(null);

    if (ebooks.length === 0) {
        return <div className="flex-1 flex items-center justify-center text-text-muted italic">{emptyMessage ?? 'Sem ebooks.'}</div>;
    }

    return (
        <div className="p-4 flex flex-wrap gap-4">
            {ebooks.map((ebook) => {
                const isInProgress = ebook.status !== 'completed';
                return (
                    <div key={ebook.ebook_isbn} className="group flex flex-col flex-1 basis-48 max-w-64 bg-white rounded-xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow">
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
                        </div>
                        {/* Actions */}
                        <div className="px-3 pb-3 pt-1 flex gap-1" onClick={e => e.stopPropagation()}>
                            {isInProgress ? (
                                <>
                                    {confirmingIsbn !== ebook.ebook_isbn && deletingIsbn !== ebook.ebook_isbn && (
                                        <button
                                            className="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-40"
                                            title="Descarregar EPUB"
                                            disabled={downloadingIsbn === ebook.ebook_isbn}
                                            onClick={async (e) => { e.stopPropagation(); setDownloadingIsbn(ebook.ebook_isbn); await onDownloadEpub(ebook.ebook_isbn); setDownloadingIsbn(null); }}>
                                            {downloadingIsbn === ebook.ebook_isbn ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                        </button>
                                    )}
                                    {deletingIsbn !== ebook.ebook_isbn && onComplete && (
                                        confirmingIsbn === ebook.ebook_isbn ? (
                                            <>
                                                <button className="flex-1 flex items-center justify-center p-2 rounded bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
                                                    onClick={(e) => { onComplete(e, ebook); setConfirmingIsbn(null); }} title="Confirmar conclusão">
                                                    <Check size={14} />
                                                </button>
                                                <button className="flex-1 flex items-center justify-center p-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                    onClick={(e) => { e.stopPropagation(); setConfirmingIsbn(null); }} title="Cancelar">
                                                    <X size={14} />
                                                </button>
                                            </>
                                        ) : (
                                            <button className="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                                onClick={(e) => { e.stopPropagation(); setConfirmingIsbn(ebook.ebook_isbn); setDeletingIsbn(null); }} title="Concluir">
                                                <Check size={14} />
                                            </button>
                                        )
                                    )}
                                    {onDelete && (
                                        deletingIsbn === ebook.ebook_isbn ? (
                                            <>
                                                <button className="flex-1 flex items-center justify-center p-2 rounded bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
                                                    onClick={(e) => { e.stopPropagation(); onDelete(ebook.ebook_isbn); setDeletingIsbn(null); }}
                                                    disabled={isDeleting} title="Confirmar eliminação">
                                                    {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                </button>
                                                <button className="flex-1 flex items-center justify-center p-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                    onClick={(e) => { e.stopPropagation(); setDeletingIsbn(null); }} title="Cancelar">
                                                    <X size={14} />
                                                </button>
                                            </>
                                        ) : confirmingIsbn !== ebook.ebook_isbn ? (
                                            <button className="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                                onClick={(e) => { e.stopPropagation(); setDeletingIsbn(ebook.ebook_isbn); setConfirmingIsbn(null); }} title="Eliminar registo">
                                                <Trash2 size={14} />
                                            </button>
                                        ) : null
                                    )}
                                    {confirmingIsbn !== ebook.ebook_isbn && deletingIsbn !== ebook.ebook_isbn && (onOpenMetadata || onOpenCover || onShare) && (
                                        <OverflowMenu
                                            iconSize={14}
                                            direction="up"
                                            buttonClassName="flex-1 flex items-center justify-center p-2 rounded border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                            items={[
                                                ...(onOpenMetadata ? [{ icon: <Settings size={13} />, label: 'Edição da Informação', onClick: (e: React.MouseEvent) => onOpenMetadata(e, ebook) }] : []),
                                                ...(onOpenCover ? [{ icon: <ImageIcon size={13} />, label: 'Capa', onClick: (e: React.MouseEvent) => onOpenCover(e, ebook) }] : []),
                                                ...(onShare ? [{ icon: <Share2 size={13} />, label: 'Partilha', onClick: (e: React.MouseEvent) => onShare(e, ebook) }] : []),
                                            ]}
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
                                        disabled={downloadingIsbn === ebook.ebook_isbn}
                                        onClick={async (e) => { e.stopPropagation(); setDownloadingIsbn(ebook.ebook_isbn); await onDownloadEpub(ebook.ebook_isbn); setDownloadingIsbn(null); }}>
                                        {downloadingIsbn === ebook.ebook_isbn ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
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
