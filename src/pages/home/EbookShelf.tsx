import React, { useState } from 'react';
import { ImageIcon, Download, Loader2, RotateCcw, PenLine } from 'lucide-react';
import type { Ebook } from '../../api/ebooks-api';

interface EbookShelfProps {
    ebooks: Ebook[];
    onNavigate?: (isbn: string) => void;
    coverVersions?: Record<string, number>;
    onDownloadEpub: (isbn: string) => Promise<void>;
    onReopen?: (e: React.MouseEvent, ebook: Ebook) => void;
    emptyMessage?: string;
}

export const EbookShelf: React.FC<EbookShelfProps> = ({
    ebooks, onNavigate, coverVersions, onDownloadEpub, onReopen, emptyMessage,
}) => {
    const [downloadingIsbn, setDownloadingIsbn] = useState<string | null>(null);

    if (ebooks.length === 0) {
        return <div className="py-12 text-center text-text-muted italic">{emptyMessage ?? 'Sem ebooks.'}</div>;
    }

    return (
        <div className="p-4 flex flex-wrap gap-3">
            {ebooks.map((ebook) => {
                const isInProgress = ebook.status !== 'completed';
                return (
                    <div
                        key={ebook.ebook_isbn}
                        className="relative group"
                        style={{ width: 100, height: 140 }}
                    >
                        <div className={`w-full h-full bg-slate-100 rounded-lg overflow-hidden border border-border shadow-sm group-hover:shadow-md transition-shadow flex items-center justify-center ${isInProgress && onNavigate ? 'cursor-pointer' : ''}`}
                            onClick={() => isInProgress && onNavigate?.(ebook.ebook_isbn)}>
                            <img
                                src={`/api/ebooks/${ebook.ebook_isbn}/cover?t=${coverVersions?.[ebook.ebook_isbn] ?? ebook.created_at}`}
                                alt=""
                                loading="lazy"
                                className="w-full h-full object-contain"
                                onLoad={(e) => { const s = e.currentTarget.nextElementSibling as HTMLElement | null; if (s) s.style.display = 'none'; }}
                                onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                            <ImageIcon size={20} className="absolute text-slate-300 pointer-events-none" />
                        </div>
                        {/* Hover overlay */}
                        <div
                            className="absolute inset-0 bg-black/70 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2"
                            onClick={e => e.stopPropagation()}
                        >
                            <p className="text-white text-xs font-semibold text-center line-clamp-3 leading-tight">{ebook.title}</p>
                            <div className="flex gap-1">
                                {isInProgress ? (
                                    <button
                                        className="p-1.5 rounded bg-white/20 hover:bg-white/30 text-white transition-colors"
                                        title="Abrir Editor"
                                        onClick={(e) => { e.stopPropagation(); onNavigate?.(ebook.ebook_isbn); }}>
                                        <PenLine size={13} />
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            className="p-1.5 rounded bg-white/20 hover:bg-white/30 text-white transition-colors disabled:opacity-40"
                                            title="Descarregar EPUB"
                                            disabled={downloadingIsbn === ebook.ebook_isbn}
                                            onClick={async (e) => { e.stopPropagation(); setDownloadingIsbn(ebook.ebook_isbn); await onDownloadEpub(ebook.ebook_isbn); setDownloadingIsbn(null); }}>
                                            {downloadingIsbn === ebook.ebook_isbn ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                        </button>
                                        {onReopen && (
                                            <button
                                                className="p-1.5 rounded bg-white/20 hover:bg-white/30 text-white transition-colors"
                                                title="Reabrir"
                                                onClick={(e) => onReopen(e, ebook)}>
                                                <RotateCcw size={13} />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
