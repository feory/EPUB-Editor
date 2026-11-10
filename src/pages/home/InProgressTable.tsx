import React from 'react';
import { useEbookRow, deleteLabels, ebookMenuItems } from './ebookRow';
import { ImageIcon, Check, X, Loader2, Trash2, Download } from 'lucide-react';
import type { Ebook } from '../../api/ebooks-api';
import { OverflowMenu } from '../../components/OverflowMenu';

interface InProgressTableProps {
    ebooks: Ebook[];
    searchSlot?: React.ReactNode;
    onNavigate: (isbn: string) => void;
    onOpenMetadata: (e: React.MouseEvent, ebook: Ebook) => void;
    onOpenCover: (e: React.MouseEvent, ebook: Ebook) => void;
    onComplete: (e: React.MouseEvent, ebook: Ebook) => void;
    onShare?: (e: React.MouseEvent, ebook: Ebook) => void;
    onDelete: (isbn: string) => void;
    ownerLabel?: (ebook: Ebook) => string | null;   // "Partilhado por X" / "De X" (null = é meu)
    isShared?: (ebook: Ebook) => boolean;   // partilhado comigo (não sou o dono): o botão remove a partilha em vez de eliminar
    isDeleting: boolean;
    coverVersions?: Record<string, number>;
    onDownloadEpub: (isbn: string) => Promise<void>;
}

export const InProgressTable: React.FC<InProgressTableProps> = ({
    ebooks, searchSlot, onNavigate, onOpenMetadata, onOpenCover, onComplete, onShare, onDelete, isShared, ownerLabel, isDeleting, coverVersions, onDownloadEpub,
}) => {
    const row = useEbookRow();

    if (ebooks.length === 0) {
        return (
            <div className="flex-1 flex flex-col">
                <div className="flex justify-end p-2 border-b border-border">{searchSlot}</div>
                <div className="flex-1 flex items-center justify-center text-text-muted italic">Não há ebooks em progresso no momento.</div>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50/50 border-b border-border">
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider w-20">Capa</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">E-ISBN</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Título</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Autor</th>
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider text-right w-80">
                            <div className="flex justify-end">{searchSlot}</div>
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border border-b border-border">
                    {ebooks.map((ebook) => (
                        <tr key={ebook.ebook_isbn} onClick={() => onNavigate(ebook.ebook_isbn)} className="hover:bg-slate-50/80 cursor-pointer transition-colors group">
                            <td className="px-6 py-4">
                                <div className="mini-cover">
                                    <img src={`/api/ebooks/${ebook.ebook_isbn}/cover?t=${coverVersions?.[ebook.ebook_isbn] ?? ebook.created_at}`} alt="" loading="lazy" onLoad={(e) => { e.currentTarget.style.display = ''; const s = e.currentTarget.nextElementSibling as HTMLElement | null; if (s) s.style.display = 'none'; }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    <ImageIcon size={16} className="placeholder-icon" />
                                </div>
                            </td>
                            <td className="px-6 py-4"><code className="bg-slate-100 px-2 py-1 rounded text-xs font-mono">{ebook.ebook_isbn}</code></td>
                            <td className="px-6 py-4">
                                <span className="font-semibold text-text-muted group-hover:text-text-main transition-colors">{ebook.title}</span>
                                {ownerLabel?.(ebook) && <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-medium text-text-muted">{ownerLabel(ebook)}</span>}
                            </td>
                            <td className="px-6 py-4 text-text-muted">{ebook.author}</td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex gap-2 justify-end" onClick={e => e.stopPropagation()}>
                                    {row.idle(ebook.ebook_isbn) && (
                                        <button className="p-2 rounded-lg border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-40"
                                            title="Descarregar EPUB"
                                            disabled={row.downloading(ebook.ebook_isbn)}
                                            onClick={async (e) => { e.stopPropagation(); await row.download(ebook.ebook_isbn, onDownloadEpub); }}>
                                            {row.downloading(ebook.ebook_isbn) ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                                        </button>
                                    )}
                                    {!row.deleting(ebook.ebook_isbn) && (row.confirming(ebook.ebook_isbn) ? (
                                        <div className="flex items-center gap-1 animate-in fade-in duration-150" onClick={e => e.stopPropagation()}>
                                            <button className="p-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-colors" onClick={(e) => { onComplete(e, ebook); row.cancel(); }} title="Confirmar conclusão">
                                                <Check size={15} />
                                            </button>
                                            <button className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors" onClick={(e) => { e.stopPropagation(); row.cancel(); }} title="Cancelar">
                                                <X size={15} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button className="p-2 rounded-lg border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                            onClick={(e) => { e.stopPropagation(); row.askComplete(ebook.ebook_isbn); }} title="Concluir">
                                            <Check size={15} />
                                        </button>
                                    ))}
                                    {row.deleting(ebook.ebook_isbn) ? (
                                        <div className="flex items-center gap-1 animate-in fade-in duration-150" onClick={e => e.stopPropagation()}>
                                            <button className="p-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
                                                onClick={(e) => { e.stopPropagation(); onDelete(ebook.ebook_isbn); row.cancel(); }}
                                                disabled={isDeleting} title={deleteLabels(!!isShared?.(ebook)).confirm}>
                                                {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                            </button>
                                            <button className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                onClick={(e) => { e.stopPropagation(); row.cancel(); }} title="Cancelar">
                                                <X size={15} />
                                            </button>
                                        </div>
                                    ) : !row.confirming(ebook.ebook_isbn) ? (
                                        <button className="p-2 rounded-lg border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                            onClick={(e) => { e.stopPropagation(); row.askDelete(ebook.ebook_isbn); }} title={deleteLabels(!!isShared?.(ebook)).ask}>
                                            <Trash2 size={15} />
                                        </button>
                                    ) : null}
                                    {row.idle(ebook.ebook_isbn) && (
                                        <OverflowMenu
                                            buttonClassName="p-2 rounded-lg border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                            items={ebookMenuItems(ebook, !!isShared?.(ebook), { onOpenMetadata, onOpenCover, onShare })}
                                        />
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
