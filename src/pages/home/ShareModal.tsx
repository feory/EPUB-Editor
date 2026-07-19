import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Share2, Loader2, Check, Search } from 'lucide-react';
import { ebooksApi, type Ebook } from '../../api/ebooks-api';
import { authApi } from '../../api/auth-api';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useNotification } from '../../context/NotificationContext';
import { ModalCloseButton } from '../../components/ModalCloseButton';

interface ShareModalProps {
    ebook: Ebook;
    onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ ebook, onClose }) => {
    useBodyScrollLock();
    const { showNotification } = useNotification();
    const queryClient = useQueryClient();
    const isbn = ebook.ebook_isbn;

    const { data: users = [], isLoading: loadingUsers } = useQuery({
        queryKey: ['basic-users'],
        queryFn: async () => (await authApi.listBasicUsers()).data.data,
    });

    const { data: shares = [], isLoading: loadingShares } = useQuery({
        queryKey: ['ebook-shares', isbn],
        queryFn: async () => (await ebooksApi.getShares(isbn)).data.data,
    });

    const sharedIds = new Set(shares.map(s => s.id));

    const shareMutation = useMutation({
        mutationFn: (userId: number) => ebooksApi.shareEbook(isbn, userId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ebook-shares', isbn] }),
        onError: () => showNotification('error', 'Erro ao partilhar o ebook.'),
    });

    const unshareMutation = useMutation({
        mutationFn: (userId: number) => ebooksApi.unshareEbook(isbn, userId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ebook-shares', isbn] }),
        onError: () => showNotification('error', 'Erro ao remover a partilha.'),
    });

    const isLoading = loadingUsers || loadingShares;
    const pendingId = shareMutation.isPending ? shareMutation.variables : unshareMutation.isPending ? unshareMutation.variables : null;

    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

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

    const filteredUsers = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return users;
        return users.filter(u => u.email.toLowerCase().includes(q));
    }, [users, query]);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-lg h-[70vh] overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50 gap-4">
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2 min-w-0">
                            <Share2 size={20} className="text-slate-500 shrink-0" />
                            Partilhar
                        </h2>
                        <p className="text-xs text-text-muted truncate ml-7">{ebook.title}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {users.length > 0 && (
                            searchOpen ? (
                                <div ref={searchRef} className="relative w-48 animate-in fade-in slide-in-from-right-2 duration-200">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder="Email..."
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); setSearchOpen(false); } }}
                                        className="w-full pl-8 pr-3 h-9 rounded-lg border border-border bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
                                    />
                                </div>
                            ) : (
                                <button onClick={() => setSearchOpen(true)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all" title="Pesquisar">
                                    <Search size={16} />
                                </button>
                            )
                        )}
                        <ModalCloseButton onClick={onClose} />
                    </div>
                </div>

                <div className="overflow-y-auto flex-1 p-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 size={24} className="animate-spin text-slate-400" />
                        </div>
                    ) : users.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-sm text-text-muted italic">
                            Não há outros utilizadores para partilhar.
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-sm text-text-muted italic">
                            Nenhum resultado para "{query}".
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filteredUsers.map(u => {
                                const shared = sharedIds.has(u.id);
                                const pending = pendingId === u.id;
                                return (
                                    <button
                                        key={u.id}
                                        disabled={pending}
                                        onClick={() => (shared ? unshareMutation.mutate(u.id) : shareMutation.mutate(u.id))}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60 text-left"
                                    >
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold uppercase ${shared ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                            {u.email.slice(0, 2)}
                                        </div>
                                        <span className="flex-1 min-w-0 truncate text-sm text-text-main">{u.email}</span>
                                        {pending ? (
                                            <Loader2 size={16} className="animate-spin text-slate-400 shrink-0" />
                                        ) : (
                                            <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-colors ${shared ? 'bg-slate-700 border-slate-700' : 'border-border'}`}>
                                                {shared && <Check size={13} className="text-white" />}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
