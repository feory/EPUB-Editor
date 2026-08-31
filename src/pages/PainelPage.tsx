import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import {
    ChevronLeft, Trash2, Loader2, AlertTriangle, Search, Check, X, CloudUpload,
    UserPlus, Shield, User, Eye, EyeOff, Pencil, Info,
} from 'lucide-react';
import { ebooksApi, type DiskUsageBook, type BackupRun } from '../api/ebooks-api';
import { authApi, type AuthUser } from '../api/auth-api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Pagination } from '../components/Pagination';
import { ModalCloseButton } from '../components/ModalCloseButton';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
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

// Botão de pesquisa que expande para caixa de texto — BooksTab/UsersTab/LogsTab partilham este
// comportamento (clicar fora colapsa só se vazio; Escape limpa+colapsa); cada tab continua dono
// do `query` (a filtragem difere por tab) e passa-o cá para dentro.
function CollapsibleSearch({ query, onQueryChange, placeholder }: { query: string; onQueryChange: (q: string) => void; placeholder: string }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node) && !query) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open, query]);

    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-200 text-text-muted transition-all shrink-0" title="Pesquisar">
                <Search size={16} />
            </button>
        );
    }
    return (
        <div ref={ref} className="relative w-56 animate-in fade-in slide-in-from-right-2 duration-200">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
                type="text"
                autoFocus
                placeholder={placeholder}
                value={query}
                onChange={e => onQueryChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { onQueryChange(''); setOpen(false); } }}
                className="w-full pl-8 pr-3 h-9 rounded-lg border border-border bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
            />
        </div>
    );
}

const TABS = [
    { key: 'stats', label: 'Estatísticas' },
    { key: 'books', label: 'Livros' },
    { key: 'users', label: 'Utilizadores' },
    { key: 'system', label: 'Sistema' },
    { key: 'backup', label: 'Backup' },
    { key: 'logs', label: 'Logs' },
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
        onError: (err: AxiosError<{ error: string }>) => showNotification('error', err?.response?.data?.error ?? 'Erro ao iniciar o mirror.'),
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
    const { data, isLoading } = useQuery({
        queryKey: ['disk-usage'],
        queryFn: () => ebooksApi.getDiskUsage().then(r => r.data),
    });

    if (isLoading || !data) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 size={24} className="animate-spin text-slate-500" />
            </div>
        );
    }

    return (
        <div className="flex justify-center">
            <div className="w-full max-w-xl bg-card-bg border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-slate-700">Divisão por categoria ({data.active.count} Livros)</h2>
                </div>
                <CategoryDonut totals={data.active.categoryTotals ?? {}} />
            </div>
        </div>
    );
}

// "Quem está a editar agora" — presença ativa (server/presence.js). Poll a cada 15s (a
// mesma janela do TTL de heartbeat, ver presence.js) — dados mudam enquanto a equipa trabalha.
function ActiveSessionsCard() {
    const { data: sessions } = useQuery({
        queryKey: ['active-sessions'],
        queryFn: () => ebooksApi.getActiveSessions().then(r => r.data.data),
        refetchInterval: 15000,
    });

    if (!sessions || sessions.length === 0) return null;

    return (
        <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold text-slate-700">Quem está a editar agora</h2>
            </div>
            <div className="divide-y divide-border">
                {sessions.map(s => (
                    <div key={s.isbn} className="px-6 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-text-color truncate">{s.title ?? s.isbn}</p>
                            <p className="text-xs text-text-muted truncate">
                                {s.holderEmail}{s.others.length > 0 && ` +${s.others.length}`}
                            </p>
                        </div>
                        <span className="shrink-0 text-xs text-text-muted">
                            {s.minutesAgo <= 0 ? 'agora' : `há ${s.minutesAgo}min`}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SystemHealthCard() {
    const { data: health } = useQuery({
        queryKey: ['system-health'],
        queryFn: () => ebooksApi.getHealth().then(r => r.data),
    });

    return (
        <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
                <h2 className="text-base font-semibold text-slate-700">Sistema</h2>
            </div>
            {!health ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 size={18} className="animate-spin text-slate-500" />
                </div>
            ) : (
                <div className="px-6 py-4 flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-text-muted">Runtime</span>
                        <span className="text-text-color font-medium">{health.runtime}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-text-muted">Memória (RSS)</span>
                        <span className="text-text-color font-medium">{formatFileSize(health.memory.rss)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-text-muted">epubcheck</span>
                        <span className={`font-medium ${health.deps.epubcheck === 'not installed' ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {health.deps.epubcheck === 'not installed' ? 'não instalado' : 'instalado'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

function SystemTab() {
    const { showNotification } = useNotification();
    const queryClient = useQueryClient();
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SystemHealthCard />
            </div>
        </>
    );
}

function BooksTab() {
    const { showNotification } = useNotification();
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ['disk-usage'],
        queryFn: () => ebooksApi.getDiskUsage().then(r => r.data),
    });
    const [query, setQuery] = useState('');
    const [confirmOrphan, setConfirmOrphan] = useState<string | null>(null);

    const purgeOrphanMutation = useMutation({
        mutationFn: (isbn: string) => ebooksApi.purgeOrphan(isbn),
        onSuccess: () => {
            showNotification('success', 'Pasta apagada.');
            queryClient.invalidateQueries({ queryKey: ['disk-usage'] });
        },
        onError: (err: AxiosError<{ error: string }>) => showNotification('error', err?.response?.data?.error ?? 'Erro ao apagar a pasta.'),
        onSettled: () => setConfirmOrphan(null),
    });

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
                        <CollapsibleSearch query={query} onQueryChange={setQuery} placeholder="Título, isbn ou autor..." />
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
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-semibold">{formatFileSize(b.total)}</span>
                                            {confirmOrphan === b.isbn ? (
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => purgeOrphanMutation.mutate(b.isbn)} disabled={purgeOrphanMutation.isPending}
                                                        className="p-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
                                                        title="Confirmar eliminação">
                                                        {purgeOrphanMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                    </button>
                                                    <button onClick={() => setConfirmOrphan(null)}
                                                        className="p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
                                                        title="Cancelar">
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => setConfirmOrphan(b.isbn)}
                                                    className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 transition-colors"
                                                    title="Apagar pasta">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
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

const USERS_PAGE_SIZE = 10;
const EMPTY_CREATE_USER = { email: '', password: '', role: 'user' as 'admin' | 'user' };

function PasswordInput({ value, onChange, required = false, placeholder = '••••••••••••' }: {
    value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string;
}) {
    const [show, setShow] = useState(false);
    return (
        <div className="relative">
            <input
                type={show ? 'text' : 'password'}
                required={required}
                minLength={required ? 12 : undefined}
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                placeholder={placeholder}
            />
            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-color">
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
        </div>
    );
}

function UserModal({ title, onClose, onSave, children }: { title: string; onClose: () => void; onSave?: () => void; children: React.ReactNode }) {
    useBodyScrollLock();
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-slate-700">{title}</h2>
                    <ModalCloseButton onClick={onClose} />
                </div>
                <div className="p-6">{children}</div>
                {onSave && (
                    <div className="p-6 border-t border-border bg-slate-50/50 flex gap-3 justify-end">
                        <button
                            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all shadow-sm active:scale-95"
                            onClick={onClose}
                        >
                            Cancelar
                        </button>
                        <button
                            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-sm active:scale-95"
                            onClick={onSave}
                        >
                            Guardar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function UsersTab() {
    const { user: currentUser } = useAuth();
    const { showNotification } = useNotification();
    const queryClient = useQueryClient();

    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState(EMPTY_CREATE_USER);
    const [editTarget, setEditTarget] = useState<AuthUser | null>(null);
    const [editForm, setEditForm] = useState({ email: '', password: '', role: 'user' as 'admin' | 'user' });
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const editFormRef = useRef<HTMLFormElement>(null);
    const createFormRef = useRef<HTMLFormElement>(null);

    const { data: users = [], isLoading } = useQuery({
        queryKey: ['admin-users'],
        queryFn: async () => (await authApi.listUsers()).data.data,
    });

    const filteredUsers = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return users;
        return users.filter((u: AuthUser) =>
            u.email.toLowerCase().includes(q) ||
            (u.role === 'admin' ? 'administrador' : 'utilizador').includes(q)
        );
    }, [users, query]);

    const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageUsers = filteredUsers.slice((safePage - 1) * USERS_PAGE_SIZE, safePage * USERS_PAGE_SIZE);

    function handleQueryChange(value: string) { setQuery(value); setPage(1); }

    const createMutation = useMutation({
        mutationFn: () => authApi.createUser(createForm.email, createForm.password, createForm.role),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            queryClient.invalidateQueries({ queryKey: ['activity-log'] });
            setCreateForm(EMPTY_CREATE_USER);
            setShowCreate(false);
            showNotification('success', 'Utilizador criado com sucesso.');
        },
        onError: (err: AxiosError<{ error: string }>) => {
            showNotification('error', err?.response?.data?.error ?? 'Erro ao criar utilizador.');
        },
    });

    const updateMutation = useMutation({
        mutationFn: () => {
            const data: { email?: string; password?: string; role?: 'admin' | 'user' } = {};
            if (editForm.email !== editTarget?.email) data.email = editForm.email;
            if (editForm.password) data.password = editForm.password;
            if (editForm.role !== editTarget?.role) data.role = editForm.role;
            return authApi.updateUser(editTarget!.id, data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            queryClient.invalidateQueries({ queryKey: ['activity-log'] });
            setEditTarget(null);
            showNotification('success', 'Utilizador atualizado.');
        },
        onError: (err: AxiosError<{ error: string }>) => {
            showNotification('error', err?.response?.data?.error ?? 'Erro ao atualizar utilizador.');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => authApi.deleteUser(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin-users'] });
            queryClient.invalidateQueries({ queryKey: ['activity-log'] });
            showNotification('success', 'Utilizador eliminado.');
        },
        onError: (err: AxiosError<{ error: string }>) => {
            showNotification('error', err?.response?.data?.error ?? 'Erro ao eliminar utilizador.');
        },
        onSettled: () => setConfirmDelete(null),
    });

    function openEdit(u: AuthUser) {
        setEditTarget(u);
        setEditForm({ email: u.email, password: '', role: u.role });
    }

    function formatUserDate(iso: string) {
        return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    const fieldClass = "w-full px-4 py-2.5 rounded-xl border border-border focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all";
    const labelClass = "text-sm font-bold text-text-main ml-1";

    return (
        <>
            <ActiveSessionsCard />

            <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                    <h2 className="text-base font-semibold text-slate-700">
                        Utilizadores {!isLoading && <span className="text-text-muted font-normal">({filteredUsers.length})</span>}
                    </h2>
                    <div className="flex items-center gap-2">
                        {users.length > 0 && (
                            <CollapsibleSearch query={query} onQueryChange={handleQueryChange} placeholder="Email ou role..." />
                        )}
                        <button
                            onClick={() => setShowCreate(true)}
                            className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 h-9 rounded-lg font-semibold text-sm transition-all shadow-sm shrink-0"
                        >
                            <UserPlus size={14} />
                            Novo Utilizador
                        </button>
                    </div>
                </div>
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 size={24} className="animate-spin text-slate-500" />
                    </div>
                ) : users.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-text-muted">Nenhum utilizador encontrado.</div>
                ) : filteredUsers.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-text-muted">Nenhum resultado para "{query}".</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-6 py-4">
                        {pageUsers.map((u: AuthUser) => (
                            <div key={u.id} className="border border-border rounded-lg p-3 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`p-1.5 rounded-lg ${u.role === 'admin' ? 'bg-slate-100' : 'bg-card-bg border border-border'}`}>
                                        {u.role === 'admin' ? <Shield size={14} className="text-slate-500" /> : <User size={14} className="text-text-muted" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-text-color truncate">{u.email}</p>
                                        <p className="text-xs text-text-muted">
                                            {u.role === 'admin' ? 'Administrador' : 'Utilizador'}
                                            {u.created_at && ` · ${formatUserDate(u.created_at)}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {confirmDelete !== u.id && (
                                        <button onClick={() => openEdit(u)}
                                            className="p-1.5 rounded-lg text-text-muted hover:text-slate-700 hover:bg-slate-100
                                       border border-transparent hover:border-slate-300 transition-colors">
                                            <Pencil size={14} />
                                        </button>
                                    )}
                                    {u.id !== currentUser?.id && u.role !== 'admin' && (
                                        confirmDelete === u.id ? (
                                            <div className="flex items-center gap-1 animate-in fade-in duration-150">
                                                <button onClick={() => deleteMutation.mutate(u.id)} disabled={deleteMutation.isPending}
                                                    className="p-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
                                                    title="Confirmar eliminação">
                                                    {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                </button>
                                                <button onClick={() => setConfirmDelete(null)}
                                                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                                                    title="Cancelar">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => setConfirmDelete(u.id)}
                                                className="p-1.5 rounded-lg border border-border text-text-muted hover:border-rose-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
                                                title="Eliminar utilizador">
                                                <Trash2 size={14} />
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
            </div>

            {showCreate && (
                <UserModal title="Novo Utilizador" onClose={() => { setShowCreate(false); setCreateForm(EMPTY_CREATE_USER); }} onSave={() => createFormRef.current?.requestSubmit()}>
                    <form ref={createFormRef} onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className={labelClass}>Email</label>
                            <input type="email" required value={createForm.email}
                                onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                                className={fieldClass} placeholder="utilizador@exemplo.com" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className={labelClass}>Role</label>
                            <select value={createForm.role}
                                onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as 'admin' | 'user' }))}
                                className={fieldClass}>
                                <option value="user">Utilizador</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className={labelClass}>Password <span className="normal-case text-text-muted">(mín. 12 caracteres)</span></label>
                            <PasswordInput value={createForm.password} onChange={v => setCreateForm(f => ({ ...f, password: v }))} required />
                        </div>
                    </form>
                </UserModal>
            )}

            {editTarget && (
                <UserModal title="Edição do Utilizador" onClose={() => setEditTarget(null)} onSave={() => editFormRef.current?.requestSubmit()}>
                    <form ref={editFormRef} onSubmit={e => { e.preventDefault(); updateMutation.mutate(); }} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className={labelClass}>Email</label>
                            <input type="email" required value={editForm.email}
                                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                                className={fieldClass} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className={labelClass}>Role</label>
                            <select value={editForm.role}
                                onChange={e => setEditForm(f => ({ ...f, role: e.target.value as 'admin' | 'user' }))}
                                className={fieldClass}
                                disabled={editTarget.id === currentUser?.id}>
                                <option value="user">Utilizador</option>
                                <option value="admin">Administrador</option>
                            </select>
                            {editTarget.id === currentUser?.id && (
                                <p className="text-xs text-text-muted">Não podes alterar o teu próprio role.</p>
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className={`${labelClass} flex items-center gap-1.5`}>
                                Nova Password
                                <span className="group relative inline-flex cursor-help">
                                    <Info size={13} className="text-slate-400" />
                                    <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 w-56 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                                        Se deixar o campo vazio, a senha mantém.
                                    </span>
                                </span>
                            </label>
                            <PasswordInput value={editForm.password} onChange={v => setEditForm(f => ({ ...f, password: v }))}
                                placeholder="Nova password (mín. 12 caracteres)" />
                        </div>
                    </form>
                </UserModal>
            )}
        </>
    );
}

const LOGS_PAGE_SIZE = 15;

const ACTION_LABELS: Record<string, string> = {
    login_success: 'Login', login_failed: 'Falha de login', logout: 'Logout',
    user_create: 'Utilizador criado', user_update: 'Utilizador editado', user_delete: 'Utilizador eliminado',
    ebook_create: 'Livro criado', ebook_status_change: 'Estado alterado',
    ebook_trash: 'Livro na reciclagem', ebook_delete_permanent: 'Livro eliminado definitivamente',
};

function formatLogMeta(raw: string | null): string {
    if (!raw) return '';
    try {
        const obj = JSON.parse(raw);
        return Object.entries(obj)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(' · ');
    } catch { return raw; }
}

function LogsTab() {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);

    const { data: logsData = [], isLoading } = useQuery({
        queryKey: ['activity-log'],
        queryFn: async () => (await ebooksApi.getActivityLog()).data.data,
    });

    const filteredLogs = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return logsData;
        return logsData.filter(l =>
            (l.user_email ?? '').toLowerCase().includes(q) ||
            (ACTION_LABELS[l.action] ?? l.action).toLowerCase().includes(q) ||
            (l.target ?? '').toLowerCase().includes(q) ||
            (l.meta ?? '').toLowerCase().includes(q) // apanha título/autor (só existem em meta, não em target)
        );
    }, [logsData, query]);

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / LOGS_PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageLogs = filteredLogs.slice((safePage - 1) * LOGS_PAGE_SIZE, safePage * LOGS_PAGE_SIZE);

    function handleQueryChange(v: string) { setQuery(v); setPage(1); }

    return (
        <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-slate-700">
                    Logs {!isLoading && <span className="text-text-muted font-normal">({filteredLogs.length})</span>}
                </h2>
                {logsData.length > 0 && (
                    <CollapsibleSearch query={query} onQueryChange={handleQueryChange} placeholder="Email, ação ou detalhe..." />
                )}
            </div>
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-slate-500" />
                </div>
            ) : logsData.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm text-text-muted">Ainda sem atividade registada.</p>
            ) : filteredLogs.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm text-text-muted">Nenhum resultado para "{query}".</p>
            ) : (
                <div className="divide-y divide-border">
                    {pageLogs.map(l => {
                        const detail = [l.target, formatLogMeta(l.meta)].filter(Boolean).join(' · ');
                        return (
                            <div key={l.id} className="px-6 py-3 flex items-center gap-4">
                                <span className="shrink-0 text-xs text-text-muted w-40">{formatDateTime(l.created_at)}</span>
                                <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 w-44 text-center truncate">
                                    {ACTION_LABELS[l.action] ?? l.action}
                                </span>
                                <span className="shrink-0 text-xs text-text-color w-48 truncate" title={l.user_email ?? ''}>{l.user_email ?? '—'}</span>
                                <span className="min-w-0 flex-1 text-xs text-text-muted truncate" title={detail}>
                                    {detail || '—'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
            <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </div>
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
                {tab === 'users' && <UsersTab />}
                {tab === 'system' && <SystemTab />}
                {tab === 'backup' && <BackupTab />}
                {tab === 'logs' && <LogsTab />}
            </div>
        </div>
    );
}
