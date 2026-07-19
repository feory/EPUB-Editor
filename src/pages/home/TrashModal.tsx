import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Trash2, Loader2, Check, X, RotateCcw, Search, Info } from 'lucide-react';
import type { Ebook } from '../../api/ebooks-api';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Pagination } from '../../components/Pagination';
import { ModalCloseButton } from '../../components/ModalCloseButton';

const PAGE_SIZE = 5;

interface TrashModalProps {
    isOpen: boolean;
    onClose: () => void;
    trashEbooks: Ebook[];
    onRestore: (isbn: string) => void;
    onPermanentDelete: (isbn: string) => void;
    isRestoring: boolean;
    isDeleting: boolean;
}

const daysRemaining = (deletedAt: string) => {
    const expires = new Date(deletedAt).getTime() + 30 * 24 * 60 * 60 * 1000;
    return Math.max(0, Math.ceil((expires - Date.now()) / (24 * 60 * 60 * 1000)));
};

export const TrashModal: React.FC<TrashModalProps> = ({
    isOpen, onClose, trashEbooks,
    onRestore, onPermanentDelete, isRestoring, isDeleting,
}) => {
    const [permDeleteIsbn, setPermDeleteIsbn] = useState<string | null>(null);
    const [restoreConfirmIsbn, setRestoreConfirmIsbn] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    useBodyScrollLock(isOpen);

    // Clicar fora colapsa a pesquisa (só quando vazia — não destrói um filtro ativo)
    useEffect(() => {
        if (!searchOpen) return;
        const onDown = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node) && !query) {
                setSearchOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [searchOpen, query]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return trashEbooks;
        return trashEbooks.filter(e =>
            e.ebook_isbn.toLowerCase().includes(q) ||
            e.title?.toLowerCase().includes(q) ||
            e.author?.toLowerCase().includes(q)
        );
    }, [trashEbooks, query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageEbooks = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    if (!isOpen) return null;

    const handleClose = () => { setPermDeleteIsbn(null); setRestoreConfirmIsbn(null); setQuery(''); setPage(1); setSearchOpen(false); onClose(); };
    const handleQueryChange = (value: string) => { setQuery(value); setPage(1); };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-border shrink-0 gap-4">
                    <div className="flex items-center gap-3 shrink-0">
                        <h2 className="text-xl font-bold text-slate-700">Reciclagem</h2>
                        {trashEbooks.length > 0 && (
                            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{trashEbooks.length}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                        {trashEbooks.length > 0 && (
                            searchOpen ? (
                                <div ref={searchRef} className="relative w-56 animate-in fade-in slide-in-from-right-2 duration-200">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="ISBN, título ou autor..."
                                        value={query}
                                        onChange={e => handleQueryChange(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Escape') { handleQueryChange(''); setSearchOpen(false); } }}
                                        className="w-full pl-8 pr-3 h-9 rounded-lg border border-border bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
                                    />
                                </div>
                            ) : (
                                <button onClick={() => setSearchOpen(true)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all shrink-0" title="Pesquisar">
                                    <Search size={16} />
                                </button>
                            )
                        )}
                        <ModalCloseButton onClick={handleClose} className="shrink-0" />
                    </div>
                </div>

                <div className="overflow-auto flex-1">
                    {trashEbooks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-text-muted">
                            <Trash2 size={40} className="opacity-20" />
                            <p className="italic">A reciclagem está vazia.</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-text-muted">
                            <Search size={40} className="opacity-20" />
                            <p className="italic">Nenhum resultado para "{query}".</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50/50 border-b border-border sticky top-0">
                                    <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">E-ISBN</th>
                                    <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Título</th>
                                    <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">Autor</th>
                                    <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider">
                                        <span className="inline-flex items-center gap-1.5">
                                            Expira
                                            <span className="group relative inline-flex cursor-help">
                                                <Info size={13} className="text-slate-400" />
                                                <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 w-56 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                                                    Eliminados permanentemente após 30 dias.
                                                </span>
                                            </span>
                                        </span>
                                    </th>
                                    <th className="px-6 py-4 text-xs font-bold text-text-muted uppercase tracking-wider text-right"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {pageEbooks.map((ebook) => {
                                    const days = daysRemaining(ebook.deleted_at!);
                                    const confirmingRestore = restoreConfirmIsbn === ebook.ebook_isbn;
                                    const confirmingDelete = permDeleteIsbn === ebook.ebook_isbn;
                                    return (
                                        <tr key={ebook.ebook_isbn} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4"><code className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-500">{ebook.ebook_isbn}</code></td>
                                            <td className="px-6 py-4 text-text-muted text-sm">{ebook.title}</td>
                                            <td className="px-6 py-4 text-text-muted text-sm">{ebook.author}</td>
                                            <td className="px-6 py-4">
                                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${days <= 3 ? 'bg-rose-100 text-rose-600' : days <= 7 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                                                    {days}d
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex gap-2 justify-end">
                                                    {confirmingRestore ? (
                                                        <div className="flex items-center gap-1 animate-in fade-in duration-150">
                                                            <button
                                                                className="p-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white transition-colors disabled:opacity-50"
                                                                onClick={() => onRestore(ebook.ebook_isbn)}
                                                                disabled={isRestoring}
                                                                title="Confirmar restauro"
                                                            >
                                                                {isRestoring ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                                            </button>
                                                            <button
                                                                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                                onClick={() => setRestoreConfirmIsbn(null)}
                                                                title="Cancelar"
                                                            >
                                                                <X size={15} />
                                                            </button>
                                                        </div>
                                                    ) : !confirmingDelete && (
                                                        <button
                                                            className="p-2 rounded-lg border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-50"
                                                            onClick={() => setRestoreConfirmIsbn(ebook.ebook_isbn)}
                                                            disabled={isRestoring}
                                                            title="Restaurar"
                                                        >
                                                            <RotateCcw size={15} />
                                                        </button>
                                                    )}
                                                    {confirmingDelete ? (
                                                        <div className="flex items-center gap-1 animate-in fade-in duration-150">
                                                            <button
                                                                className="p-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
                                                                onClick={() => onPermanentDelete(ebook.ebook_isbn)}
                                                                disabled={isDeleting}
                                                                title="Confirmar eliminação permanente"
                                                            >
                                                                {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                                            </button>
                                                            <button
                                                                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                                onClick={() => setPermDeleteIsbn(null)}
                                                                title="Cancelar"
                                                            >
                                                                <X size={15} />
                                                            </button>
                                                        </div>
                                                    ) : !confirmingRestore && (
                                                        <button
                                                            className="p-2 rounded-lg border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                                                            onClick={() => setPermDeleteIsbn(ebook.ebook_isbn)}
                                                            title="Eliminar permanentemente"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
            </div>
        </div>
    );
};
