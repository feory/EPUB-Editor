import React, { useState } from 'react';
import { ImageIcon, Download, Loader2, RotateCcw, Info } from 'lucide-react';
import type { Ebook } from '../../api/ebooks-api';
import { ModalCloseButton } from '../../components/ModalCloseButton';

interface CompletedTableProps {
    ebooks: Ebook[];
    searchSlot?: React.ReactNode;
    onReopen: (e: React.MouseEvent, ebook: Ebook) => void;
    coverVersions?: Record<string, number>;
    onDownloadEpub: (isbn: string) => Promise<void>;
}

export const CompletedTable: React.FC<CompletedTableProps> = ({
    ebooks, searchSlot, onReopen, coverVersions, onDownloadEpub,
}) => {
    const [downloadingIsbn, setDownloadingIsbn] = useState<string | null>(null);
    const [viewingEbook, setViewingEbook] = useState<Ebook | null>(null);
    if (ebooks.length === 0) {
        return (
            <div className="flex-1 flex flex-col">
                <div className="flex justify-end p-2 border-b border-border">{searchSlot}</div>
                <div className="flex-1 flex items-center justify-center text-text-muted italic">Não há ebooks concluídos ainda.</div>
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
                        <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider text-right">
                            <div className="w-full">{searchSlot}</div>
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border border-b border-border">
                    {ebooks.map((ebook) => (
                        <tr key={ebook.ebook_isbn} className="hover:bg-slate-50/80 transition-colors group">
                            <td className="px-6 py-4">
                                <div className="mini-cover">
                                    <img src={`/api/ebooks/${ebook.ebook_isbn}/cover?t=${coverVersions?.[ebook.ebook_isbn] ?? ebook.created_at}`} alt="" loading="lazy" onLoad={(e) => { const s = e.currentTarget.nextElementSibling as HTMLElement | null; if (s) s.style.display = 'none'; }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                                    <ImageIcon size={16} className="placeholder-icon" />
                                </div>
                            </td>
                            <td className="px-6 py-4"><code className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-500">{ebook.ebook_isbn}</code></td>
                            <td className="px-6 py-4">
                                <span className="font-semibold text-text-muted group-hover:text-text-main transition-colors">{ebook.title}</span>
                            </td>
                            <td className="px-6 py-4 text-text-muted italic text-sm">{ebook.author}</td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex gap-2 justify-end" onClick={e => e.stopPropagation()}>
                                    <button
                                        className="p-2 rounded-lg border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                        title="Metadados"
                                        onClick={(e) => { e.stopPropagation(); setViewingEbook(ebook); }}>
                                        <Info size={15} />
                                    </button>
                                    <button
                                        className="p-2 rounded-lg border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-40"
                                        title="Descarregar EPUB"
                                        disabled={downloadingIsbn === ebook.ebook_isbn}
                                        onClick={async (e) => { e.stopPropagation(); setDownloadingIsbn(ebook.ebook_isbn); await onDownloadEpub(ebook.ebook_isbn); setDownloadingIsbn(null); }}>
                                        {downloadingIsbn === ebook.ebook_isbn ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                                    </button>
                                    <button
                                        className="p-2 rounded-lg border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                        onClick={(e) => onReopen(e, ebook)} title="Reabrir">
                                        <RotateCcw size={15} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {viewingEbook && <MetadataViewModal ebook={viewingEbook} onClose={() => setViewingEbook(null)} />}
        </div>
    );
};

const LANGUAGES: Record<string, string> = { pt: 'Português', en: 'Inglês', es: 'Espanhol', fr: 'Francês' };

export const MetadataViewModal: React.FC<{ ebook: Ebook; onClose: () => void }> = ({ ebook, onClose }) => {
    const field = (label: string, value?: string) => (
        <div className="space-y-1.5">
            <dt className="text-xs font-black text-text-muted uppercase tracking-wider ml-1">{label}</dt>
            <dd className="px-1 text-text-main">{value && value.trim() ? value : '—'}</dd>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700">Informações do Livro</h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                <dl className="overflow-y-auto p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        {field('Título', ebook.title)}
                        {field('Autor', ebook.author)}
                    </div>
                    {field('Sinopse / Descrição', ebook.description)}
                    <div className="grid grid-cols-2 gap-6">
                        {field('Editora', ebook.publisher)}
                        {field('Data de Publicação', ebook.pub_date)}
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        {field('Idioma', ebook.language ? (LANGUAGES[ebook.language] ?? ebook.language) : undefined)}
                        {field('Etiquetas / Assuntos', ebook.subjects)}
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        {field('ISBN Livro Físico', ebook.physical_isbn)}
                        {field('E-ISBN', ebook.ebook_isbn)}
                    </div>
                </dl>

                <div className="p-6 border-t border-border bg-slate-50/50 flex justify-end">
                    <button onClick={onClose} className="px-8 py-2.5 font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">Fechar</button>
                </div>
            </div>
        </div>
    );
};
