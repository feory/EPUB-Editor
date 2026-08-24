import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Trash2, Loader2, AlertTriangle, Search, Check, X, CloudUpload } from 'lucide-react';
import { ebooksApi, type DiskUsageBook } from '../api/ebooks-api';
import { useNotification } from '../context/NotificationContext';
import { Pagination } from '../components/Pagination';
import { formatFileSize } from '../utils/format';

const PAGE_SIZE = 10;

const CATEGORY_LABELS: Record<string, string> = {
    epub: 'EPUB', history: 'Histórico', images: 'Imagens',
    thumbnails: 'Miniaturas', aceReports: 'Acessibilidade', misc: 'Outros',
};
const CATEGORY_COLORS: Record<string, string> = {
    epub: 'bg-slate-500', history: 'bg-amber-500', images: 'bg-sky-500',
    thumbnails: 'bg-teal-500', aceReports: 'bg-rose-500', misc: 'bg-slate-300',
};

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div className="bg-card-bg border border-border rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-1">
            <p className={`text-lg font-bold ${accent ?? 'text-slate-700'}`}>{value}</p>
            <p className="text-xs text-text-muted">{label}</p>
        </div>
    );
}

function CategoryBreakdown({ totals }: { totals: Record<string, number> }) {
    const grand = Object.values(totals).reduce((s, v) => s + v, 0);
    if (grand === 0) return <p className="text-sm text-text-muted px-6 py-4">Sem dados.</p>;
    return (
        <div className="px-6 py-4 flex flex-col gap-3">
            {Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([key, bytes]) => (
                <div key={key} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs font-medium text-text-muted">{CATEGORY_LABELS[key] ?? key}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full ${CATEGORY_COLORS[key] ?? 'bg-slate-400'}`} style={{ width: `${(bytes / grand) * 100}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-xs text-text-muted text-right">{formatFileSize(bytes)}</span>
                </div>
            ))}
        </div>
    );
}

function BookTable({ books, emptyLabel }: { books: DiskUsageBook[]; emptyLabel: string }) {
    const [page, setPage] = useState(1);
    const totalPages = Math.max(1, Math.ceil(books.length / PAGE_SIZE));
    const pageBooks = books.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    if (books.length === 0) return <p className="px-6 py-8 text-center text-sm text-text-muted">{emptyLabel}</p>;

    return (
        <>
            <div className="divide-y divide-border">
                {pageBooks.map(b => (
                    <div key={b.isbn} className="px-6 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-text-color truncate">{b.title ?? b.isbn}</p>
                            <p className="text-xs text-text-muted">{b.isbn}{b.author && ` · ${b.author}`}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-slate-700">{formatFileSize(b.total)}</span>
                    </div>
                ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
    );
}

export function PainelPage() {
    const navigate = useNavigate();
    const { showNotification } = useNotification();
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['disk-usage'],
        queryFn: () => ebooksApi.getDiskUsage().then(r => r.data),
    });

    const cleanupMutation = useMutation({
        mutationFn: () => ebooksApi.cleanupHistory(),
        onSuccess: (res) => {
            setConfirmCleanup(false);
            showNotification('success', `Limpeza concluída! Removidos ${res.data.deletedCount} ficheiros (${res.data.sizeSavedMB} MB).`);
            queryClient.invalidateQueries({ queryKey: ['disk-usage'] });
        },
        onError: () => showNotification('error', 'Erro ao realizar a limpeza do histórico.'),
    });

    const backupMutation = useMutation({
        mutationFn: () => ebooksApi.runBackup(),
        // Mirror pode levar minutos (rclone sync) — o pedido devolve logo "iniciado", o
        // resultado real só fica nos logs do servidor (ver server/index.js).
        onSuccess: () => showNotification('success', 'Mirror com o B2 iniciado em background.'),
        onError: (err: any) => showNotification('error', err?.response?.data?.error ?? 'Erro ao iniciar o mirror.'),
    });

    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [confirmCleanup, setConfirmCleanup] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // Clicar fora colapsa a pesquisa (só quando vazia — não destrói um filtro ativo)
    useEffect(() => {
        if (!searchOpen) return;
        const onDown = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node) && !query) setSearchOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [searchOpen, query]);

    const filteredActiveBooks = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q || !data) return data?.active.books ?? [];
        return data.active.books.filter(b =>
            b.isbn.toLowerCase().includes(q) ||
            (b.title ?? '').toLowerCase().includes(q) ||
            (b.author ?? '').toLowerCase().includes(q)
        );
    }, [data, query]);

    return (
        <div className="min-h-screen bg-bg-color px-4 py-8">
            <div className="max-w-6xl mx-auto flex flex-col gap-8">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/')}
                            className="p-2 rounded-lg hover:bg-card-bg border border-transparent hover:border-border transition-colors">
                            <ChevronLeft size={18} className="text-text-muted" />
                        </button>
                        <h1 className="text-xl font-bold text-slate-700">Painel</h1>
                    </div>
                    <div className="flex items-center gap-2">
                    <button
                        onClick={() => backupMutation.mutate()}
                        disabled={backupMutation.isPending}
                        className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 h-10 rounded-lg font-semibold text-sm transition-all shadow-sm disabled:opacity-50"
                        title="Sincroniza data/ com o Backblaze B2 (rclone mirror, background)"
                    >
                        {backupMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                        Sincronizar B2
                    </button>
                    {confirmCleanup ? (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted">Remove definitivamente todos os rascunhos com +7 dias, de todos os livros. Não pode ser desfeito.</span>
                            <button
                                onClick={() => cleanupMutation.mutate()}
                                disabled={cleanupMutation.isPending}
                                className="inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 h-10 rounded-lg font-semibold text-sm transition-all shadow-sm disabled:opacity-50 shrink-0"
                            >
                                {cleanupMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                Confirmar
                            </button>
                            <button
                                onClick={() => setConfirmCleanup(false)}
                                className="p-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors shrink-0"
                                title="Cancelar"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmCleanup(true)}
                            className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 h-10 rounded-lg font-semibold text-sm transition-all shadow-sm"
                        >
                            <Trash2 size={14} />
                            Limpar Histórico
                        </button>
                    )}
                    </div>
                </div>

                {isLoading || !data ? (
                    <div className="flex items-center justify-center py-24">
                        <Loader2 size={24} className="animate-spin text-slate-500" />
                    </div>
                ) : (
                    <>
                        {/* Stat tiles */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatTile label="Livros ativos" value={String(data.active.count)} />
                            <StatTile label="Espaço total (ativos)" value={formatFileSize(data.active.totalBytes)} />
                            <StatTile label="Espaço na Reciclagem" value={formatFileSize(data.trash.totalBytes)} accent="text-amber-600" />
                            <StatTile label="Relatórios de acessibilidade"
                                value={formatFileSize((data.active.categoryTotals?.aceReports ?? 0) + (data.trash.categoryTotals?.aceReports ?? 0))}
                                accent="text-amber-600" />
                        </div>
                        <p className="text-xs text-text-muted -mt-6">
                            Relatórios de acessibilidade não são limpos automaticamente.
                        </p>

                        {/* Category breakdown */}
                        <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-border">
                                <h2 className="text-base font-semibold text-slate-700">Divisão por categoria (livros ativos)</h2>
                            </div>
                            <CategoryBreakdown totals={data.active.categoryTotals ?? {}} />
                        </div>

                        {/* Active books */}
                        <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                                <h2 className="text-base font-semibold text-slate-700">
                                    Livros <span className="text-text-muted font-normal">({filteredActiveBooks.length})</span>
                                </h2>
                                {data.active.books.length > 0 && (
                                    searchOpen ? (
                                        <div ref={searchRef} className="relative w-56 animate-in fade-in slide-in-from-right-2 duration-200">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            <input
                                                type="text"
                                                autoFocus
                                                placeholder="Título, isbn ou autor..."
                                                value={query}
                                                onChange={e => setQuery(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Escape') { setQuery(''); setSearchOpen(false); } }}
                                                className="w-full pl-8 pr-3 h-9 rounded-lg border border-border bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
                                            />
                                        </div>
                                    ) : (
                                        <button onClick={() => setSearchOpen(true)} className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-200 text-text-muted transition-all shrink-0" title="Pesquisar">
                                            <Search size={16} />
                                        </button>
                                    )
                                )}
                            </div>
                            {filteredActiveBooks.length === 0 && query ? (
                                <p className="px-6 py-8 text-center text-sm text-text-muted">Nenhum resultado para "{query}".</p>
                            ) : (
                                <BookTable key={query} books={filteredActiveBooks} emptyLabel="Nenhum livro." />
                            )}
                        </div>

                        {/* Trash */}
                        {data.trash.count > 0 && (
                            <div className="bg-card-bg border border-amber-200 rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/50">
                                    <h2 className="text-base font-semibold text-amber-700">
                                        Reciclagem <span className="text-amber-500 font-normal">({data.trash.count})</span>
                                    </h2>
                                    <p className="text-xs text-amber-600">Ocupam espaço até serem purgados automaticamente (30 dias).</p>
                                </div>
                                <BookTable books={data.trash.books} emptyLabel="Reciclagem vazia." />
                            </div>
                        )}

                        {/* Orphaned */}
                        {data.orphaned.count > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-amber-200 flex items-center gap-2">
                                    <AlertTriangle size={16} className="text-amber-600" />
                                    <h2 className="text-base font-semibold text-amber-800">
                                        Pastas sem registo ({data.orphaned.count}, {formatFileSize(data.orphaned.totalBytes)})
                                    </h2>
                                </div>
                                <div className="divide-y divide-amber-100">
                                    {data.orphaned.books.map(b => (
                                        <div key={b.isbn} className="px-6 py-3 flex items-center justify-between gap-4 text-sm text-amber-800">
                                            <span>{b.isbn}</span>
                                            <span className="font-semibold">{formatFileSize(b.total)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
