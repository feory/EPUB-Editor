import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Trash2, Loader2, AlertTriangle, Search, Check, X, CloudUpload } from 'lucide-react';
import { ebooksApi, type DiskUsageBook, type BackupRun } from '../api/ebooks-api';
import { useNotification } from '../context/NotificationContext';
import { Pagination } from '../components/Pagination';
import { formatFileSize } from '../utils/format';

const PAGE_SIZE = 12; // par — enche as 2 colunas do BookTable sem sobrar 1 sozinho

const CATEGORY_LABELS: Record<string, string> = {
    epub: 'EPUB', history: 'Histórico', images: 'Imagens',
    thumbnails: 'Miniaturas', aceReports: 'Acessibilidade', misc: 'Outros',
};
// Ordem fixa (nunca ciclada) do tema categórico validado do dataviz skill — 6 dos 8 slots,
// já passa CVD/contraste/legibilidade em conjunto (scripts/validate_palette.js, referências
// do skill). Usado só pelo donut abaixo — não pelas listas de livros (sem categorias lá).
const CATEGORY_COLORS: Record<string, string> = {
    epub: '#2a78d6', history: '#eb6834', images: '#1baf7a',
    thumbnails: '#eda100', aceReports: '#e87ba4', misc: '#008300',
};
// Deriva da ordem de CATEGORY_LABELS — nunca diverge dele (3 arrays paralelos escritos à mão
// era um risco real de desalinhamento silencioso).
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div className="bg-card-bg border border-border rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-1">
            <p className={`text-lg font-bold ${accent ?? 'text-slate-700'}`}>{value}</p>
            <p className="text-xs text-text-muted">{label}</p>
        </div>
    );
}

// Donut SVG simples (sem lib de gráficos, mesma linha do resto da app) — anel via
// stroke-dasharray por categoria (arco = valor/total da circunferência, com um pequeno gap
// angular entre segmentos, cap arredondado). Centro é a "tooltip": mostra o total parado, e a
// categoria em foco/hover ao passar — hover e focus do teclado atualizam o mesmo estado, por
// isso têm sempre paridade (regra do dataviz skill).
function CategoryDonut({ totals }: { totals: Record<string, number> }) {
    const [active, setActive] = useState<string | null>(null);
    const grand = Object.values(totals).reduce((s, v) => s + v, 0);
    if (grand === 0) return <p className="text-sm text-text-muted px-6 py-8 text-center">Sem dados.</p>;

    const entries = CATEGORY_ORDER
        .map(key => ({ key, bytes: totals[key] ?? 0 }))
        .filter(e => e.bytes > 0);

    const R = 45, STROKE = 16, C = 2 * Math.PI * R;
    const GAP = entries.length > 1 ? 3 : 0; // unidades do viewBox — só faz sentido com >1 fatia
    // reduce imutável (sem mutar variável fora do callback — cada passo devolve um acumulador
    // novo) para o offset angular acumulado de cada fatia.
    const arcs = entries.reduce<{ list: { key: string; bytes: number; dash: string; dashoffset: number }[]; offset: number }>(
        (acc, { key, bytes }) => {
            const len = (bytes / grand) * C;
            const dash = `${Math.max(0, len - GAP)} ${C - Math.max(0, len - GAP)}`;
            return { list: [...acc.list, { key, bytes, dash, dashoffset: -acc.offset }], offset: acc.offset + len };
        },
        { list: [], offset: 0 },
    ).list;

    const activeEntry = entries.find(e => e.key === active);
    const centerLabel = activeEntry
        ? { title: CATEGORY_LABELS[activeEntry.key] ?? activeEntry.key, value: formatFileSize(activeEntry.bytes), sub: `${Math.round((activeEntry.bytes / grand) * 100)}%` }
        : { title: 'Total', value: formatFileSize(grand), sub: `${entries.length} ${entries.length === 1 ? 'categoria' : 'categorias'}` };

    return (
        <div className="px-6 py-6 flex flex-col sm:flex-row items-center gap-8">
            <div className="relative shrink-0" style={{ width: 200, height: 200 }}>
                <svg viewBox="0 0 120 120" width={200} height={200} className="-rotate-90">
                    {arcs.map(({ key, dash, dashoffset }) => (
                        <circle
                            key={key}
                            cx={60} cy={60} r={R} fill="none"
                            stroke={CATEGORY_COLORS[key] ?? '#94a3b8'}
                            strokeWidth={active && active !== key ? STROKE - 4 : STROKE}
                            strokeDasharray={dash}
                            strokeDashoffset={dashoffset}
                            strokeLinecap="round"
                            opacity={active && active !== key ? 0.45 : 1}
                            tabIndex={0}
                            role="img"
                            aria-label={`${CATEGORY_LABELS[key] ?? key}: ${formatFileSize(totals[key] ?? 0)}`}
                            onMouseEnter={() => setActive(key)}
                            onMouseLeave={() => setActive(null)}
                            onFocus={() => setActive(key)}
                            onBlur={() => setActive(null)}
                            className="transition-all duration-150 outline-none cursor-default"
                            style={{ transformOrigin: '60px 60px' }}
                        />
                    ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-6">
                    <p className="text-xs text-text-muted">{centerLabel.title}</p>
                    <p className="text-lg font-bold text-slate-700">{centerLabel.value}</p>
                    <p className="text-xs text-text-muted">{centerLabel.sub}</p>
                </div>
            </div>

            <div className="flex-1 w-full min-w-0 flex flex-col gap-1.5">
                {entries.map(({ key, bytes }) => (
                    <button
                        key={key}
                        type="button"
                        onMouseEnter={() => setActive(key)}
                        onMouseLeave={() => setActive(null)}
                        onFocus={() => setActive(key)}
                        onBlur={() => setActive(null)}
                        className={`flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors ${active === key ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                    >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[key] ?? '#94a3b8' }} />
                        <span className="flex-1 min-w-0 text-sm text-text-color truncate">{CATEGORY_LABELS[key] ?? key}</span>
                        <span className="shrink-0 text-xs text-text-muted">{Math.round((bytes / grand) * 100)}%</span>
                        <span className="w-16 shrink-0 text-sm font-semibold text-slate-700 text-right">{formatFileSize(bytes)}</span>
                    </button>
                ))}
            </div>
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
            {/* 2 colunas — aproveita melhor a largura do que 1 livro por linha */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-6 py-4">
                {pageBooks.map(b => (
                    <div key={b.isbn} className="border border-border rounded-lg p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-text-color truncate">{b.title ?? b.isbn}</p>
                            <p className="text-xs text-text-muted truncate">{b.isbn}{b.author && ` · ${b.author}`}</p>
                            {b.creator && <p className="text-xs text-text-muted truncate">Criado por {b.creator}</p>}
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-slate-700">{formatFileSize(b.total)}</span>
                    </div>
                ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
    );
}

const TABS = [
    { key: 'stats', label: 'Estatísticas' },
    { key: 'books', label: 'Livros' },
    { key: 'backup', label: 'Backup' },
] as const;
type TabKey = typeof TABS[number]['key'];

const BACKUP_STATUS_STYLE: Record<BackupRun['status'], string> = {
    running: 'bg-sky-100 text-sky-700',
    success: 'bg-emerald-100 text-emerald-700',
    error: 'bg-rose-100 text-rose-700',
};
const BACKUP_STATUS_LABEL: Record<BackupRun['status'], string> = {
    running: 'A correr', success: 'Concluído', error: 'Erro',
};

function formatDateTime(iso: string | null) {
    if (!iso) return '—';
    // valores do SQLite (datetime('now')) não têm timezone — tratados como UTC (Z) para
    // converter certo para a hora local do browser.
    return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('pt-PT');
}

function BackupTab() {
    const { showNotification } = useNotification();
    const queryClient = useQueryClient();

    const { data: log } = useQuery({
        queryKey: ['backup-log'],
        queryFn: () => ebooksApi.getBackupLog().then(r => r.data.data),
        // Enquanto houver uma corrida "running", confere a cada 5s — dá para ver o resultado
        // do mirror sem F5 manual (pode levar minutos, ver performBackup no servidor).
        refetchInterval: (query) => query.state.data?.some(r => r.status === 'running') ? 5000 : false,
    });

    const { data: schedule } = useQuery({
        queryKey: ['backup-schedule'],
        queryFn: () => ebooksApi.getBackupSchedule().then(r => r.data.schedule),
    });
    // Input não controlado (defaultValue) — `key={schedule}` remonta quando a query chega, sem
    // precisar de useEffect a copiar prop→state (cascading render).
    const scheduleInputRef = useRef<HTMLInputElement>(null);

    const backupMutation = useMutation({
        mutationFn: () => ebooksApi.runBackup(),
        onSuccess: () => {
            showNotification('success', 'Mirror com o B2 iniciado em background.');
            queryClient.invalidateQueries({ queryKey: ['backup-log'] });
        },
        onError: (err: any) => showNotification('error', err?.response?.data?.error ?? 'Erro ao iniciar o mirror.'),
    });

    const scheduleMutation = useMutation({
        mutationFn: () => ebooksApi.setBackupSchedule(scheduleInputRef.current?.value ?? ''),
        onSuccess: () => {
            showNotification('success', 'Horário guardado.');
            queryClient.invalidateQueries({ queryKey: ['backup-schedule'] });
        },
        onError: () => showNotification('error', 'Erro ao guardar o horário.'),
    });

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-card-bg border border-border rounded-2xl p-6 flex items-center justify-between gap-4">
                    <h2 className="text-base font-semibold text-slate-700 cursor-help" title="Espelha data/ inteira (mirror, rclone sync) para o bucket B2 — só transfere o que mudou.">
                        Sincronização manual
                    </h2>
                    <button
                        onClick={() => backupMutation.mutate()}
                        disabled={backupMutation.isPending}
                        className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 h-10 rounded-lg font-semibold text-sm transition-all shadow-sm disabled:opacity-50 shrink-0"
                    >
                        {backupMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                        Sincronizar B2
                    </button>
                </div>

                <div className="bg-card-bg border border-border rounded-2xl p-6 flex items-center justify-between gap-4">
                    <h2 className="text-base font-semibold text-slate-700 cursor-help"
                        title='Expressão cron de 5 campos (minuto hora dia mês dia-semana), ex. "0 3 * * *" = todos os dias às 3h. Aplicado de imediato ao guardar. Vazio = default (3h diariamente).'>
                        Agendamento
                    </h2>
                    <div className="flex items-center gap-2 shrink-0">
                        <input
                            key={schedule ?? ''}
                            ref={scheduleInputRef}
                            type="text"
                            defaultValue={schedule ?? ''}
                            placeholder="ex. 0 3 * * * (cron)"
                            className="w-40 h-10 px-3 rounded-lg border border-border bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
                        />
                        <button
                            onClick={() => scheduleMutation.mutate()}
                            disabled={scheduleMutation.isPending}
                            className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 h-10 rounded-lg font-semibold text-sm transition-all shadow-sm disabled:opacity-50"
                        >
                            {scheduleMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Guardar
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-slate-700">Registo de sincronizações</h2>
                </div>
                {!log || log.length === 0 ? (
                    <p className="px-6 py-8 text-center text-sm text-text-muted">Ainda sem sincronizações.</p>
                ) : (
                    <div className="divide-y divide-border">
                        {log.map(run => (
                            <div key={run.id} className="px-6 py-3 flex items-center gap-4">
                                <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${BACKUP_STATUS_STYLE[run.status]}`}>
                                    {BACKUP_STATUS_LABEL[run.status]}
                                </span>
                                <span className="shrink-0 text-xs text-text-muted w-16">{run.source === 'manual' ? 'Manual' : 'Cron'}</span>
                                <span className="shrink-0 text-xs text-text-muted w-40">{formatDateTime(run.started_at)}</span>
                                <span className="min-w-0 flex-1 text-xs text-text-muted truncate" title={run.summary ?? ''}>{run.summary ?? '—'}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function StatsTab() {
    const { showNotification } = useNotification();
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['disk-usage'],
        queryFn: () => ebooksApi.getDiskUsage().then(r => r.data),
    });
    const [confirmCleanup, setConfirmCleanup] = useState(false);

    const cleanupMutation = useMutation({
        mutationFn: () => ebooksApi.cleanupHistory(),
        onSuccess: (res) => {
            setConfirmCleanup(false);
            showNotification('success', `Limpeza concluída! Removidos ${res.data.deletedCount} ficheiros (${res.data.sizeSavedMB} MB).`);
            queryClient.invalidateQueries({ queryKey: ['disk-usage'] });
        },
        onError: () => showNotification('error', 'Erro ao realizar a limpeza do histórico.'),
    });

    if (isLoading || !data) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 size={24} className="animate-spin text-slate-500" />
            </div>
        );
    }

    return (
        <>
            <div className="flex justify-end">
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

            {/* Stat tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatTile label="Livros ativos" value={String(data.active.count)} />
                <StatTile label="Espaço total (ativos)" value={formatFileSize(data.active.totalBytes)} />
                <StatTile label="Espaço na Reciclagem" value={formatFileSize(data.trash.totalBytes)} accent="text-amber-600" />
                <StatTile label="Relatórios de acessibilidade"
                    value={formatFileSize((data.active.categoryTotals?.aceReports ?? 0) + (data.trash.categoryTotals?.aceReports ?? 0))}
                    accent="text-amber-600" />
            </div>
            <p className="text-xs text-text-muted -mt-4">
                Relatórios de acessibilidade não são limpos automaticamente.
            </p>

            {/* Category breakdown — 1 donut por bucket (ativos sempre; Reciclagem só se tiver algo) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-border">
                        <h2 className="text-base font-semibold text-slate-700">Divisão por categoria (livros ativos)</h2>
                    </div>
                    <CategoryDonut totals={data.active.categoryTotals ?? {}} />
                </div>
                {data.trash.count > 0 && (
                    <div className="bg-card-bg border border-amber-200 rounded-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/50">
                            <h2 className="text-base font-semibold text-amber-700">Divisão por categoria (Reciclagem)</h2>
                        </div>
                        <CategoryDonut totals={data.trash.categoryTotals ?? {}} />
                    </div>
                )}
            </div>
        </>
    );
}

function BooksTab() {
    const { data, isLoading } = useQuery({
        queryKey: ['disk-usage'],
        queryFn: () => ebooksApi.getDiskUsage().then(r => r.data),
    });
    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
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

    if (isLoading || !data) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 size={24} className="animate-spin text-slate-500" />
            </div>
        );
    }

    return (
        <>
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

            {(data.trash.count > 0 || data.orphaned.count > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                </div>
            )}
        </>
    );
}

export function PainelPage() {
    const navigate = useNavigate();
    const [tab, setTab] = useState<TabKey>('stats');

    return (
        <div className="min-h-screen bg-bg-color px-4 py-8">
            <div className="max-w-6xl mx-auto flex flex-col gap-6">

                {/* Header */}
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')}
                        className="p-2 rounded-lg hover:bg-card-bg border border-transparent hover:border-border transition-colors">
                        <ChevronLeft size={18} className="text-text-muted" />
                    </button>
                    <h1 className="text-xl font-bold text-slate-700">Painel</h1>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 border-b border-border">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {tab === 'stats' && <StatsTab />}
                {tab === 'books' && <BooksTab />}
                {tab === 'backup' && <BackupTab />}
            </div>
        </div>
    );
}
