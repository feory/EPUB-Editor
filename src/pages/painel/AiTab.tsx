import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Loader2, Search, Eye, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { aiAdminApi, type AiModel, type ProviderSort } from '../../api/ai-admin-api';
import { PasswordInput } from '../../components/PasswordInput';
import { useNotification } from '../../context/NotificationContext';

const price = (n: number) => (n === 0 ? 'grátis' : `$${n < 1 ? n.toFixed(2) : n.toFixed(1)}`);
const SORTS: [ProviderSort, string][] = [['price', 'Mais barato'], ['throughput', 'Mais rápido (mais tokens por segundo)'], ['latency', 'Menor latência (começa a responder mais cedo)'], ['auto', 'Automático (a OpenRouter distribui os pedidos)']];
const MAX_LISTED = 80; // a lista da OpenRouter tem centenas; a pesquisa e os filtros afunilam
/** A empresa do modelo é o prefixo do id (os "~empresa/…" são atalhos da mesma). */
const companyOf = (m: AiModel) => m.id.split('/')[0].replace(/^~/, '');
const isFree = (m: AiModel) => m.promptPerMillion === 0 && m.completionPerMillion === 0;
const FILTER_CLASS = 'h-9 rounded-lg border border-border bg-slate-50 px-3 text-sm text-text-main outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20';
const NO_FILTERS = { vision: false, price: 'all' as 'all' | 'free' | 'paid', company: '' };

/** Cartão que recolhe pelo título; `<details>` nativo (teclado e leitor de ecrã de origem). */
function Card({ title, bodyClass, children }: { title: string; bodyClass: string; children: ReactNode }) {
    return (
        <details className="groupbg-card-bg border border-border rounded-2xl overflow-hidden">
            <summary className="px-6 py-4 flex items-center justify-between gap-3 cursor-pointer list-none select-none hover:bg-slate-50 group-open:border-b group-open:border-border [&::-webkit-details-marker]:hidden">
                <h2 className="text-base font-semibold text-slate-700">{title}</h2>
                <ChevronDown size={18} aria-hidden className="shrink-0 text-text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className={`px-6 py-5 flex flex-col ${bodyClass}`}>{children}</div>
        </details>
    );
}

/** Painel → IA: a chave da OpenRouter, o modelo que o assistente usa e as opções de fornecedor. A chave nunca volta ao browser. */
export function AiTab() {
    const { showNotification } = useNotification();
    const queryClient = useQueryClient();
    const [newKey, setNewKey] = useState('');
    const [query, setQuery] = useState('');
    const [filters, setFilters] = useState(NO_FILTERS);
    const [picked, setPicked] = useState<string | null>(null);
    const [options, setOptions] = useState<{ providerSort?: ProviderSort; denyData?: boolean }>({}); // só o que foi mexido
    const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

    const { data: settings, isLoading } = useQuery({ queryKey: ['ai-settings'], queryFn: aiAdminApi.getSettings });
    const providerSort = options.providerSort ?? settings?.providerSort ?? 'price';
    const { data: models, isLoading: loadingModels, isError: modelsError, refetch: refetchModels } = useQuery({
        queryKey: ['ai-models', providerSort], queryFn: () => aiAdminApi.getModels(providerSort), placeholderData: keepPreviousData, staleTime: 10 * 60 * 1000, retry: false, enabled: !!settings?.keyConfigured, // sem chave não há modelo a escolher
    });

    const save = useMutation({
        mutationFn: aiAdminApi.saveSettings,
        onSuccess: (data) => { queryClient.setQueryData(['ai-settings'], data); setTest(null); showNotification('success', 'Definições guardadas.'); },
        onError: (err: AxiosError<{ error: string }>) => showNotification('error', err?.response?.data?.error ?? 'Erro ao guardar.'),
    });
    const testMutation = useMutation({
        mutationFn: aiAdminApi.testConnection,
        onSuccess: setTest,
        onError: () => setTest({ ok: false, message: 'Não foi possível testar.' }),
    });

    const current = picked ?? settings?.model ?? null;
    const matching = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (models ?? []).filter((m) => (!q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
            && (!filters.vision || m.vision)
            && (filters.price === 'all' || isFree(m) === (filters.price === 'free'))
            && (!filters.company || companyOf(m) === filters.company));
    }, [models, query, filters]);
    const shown = matching.slice(0, MAX_LISTED);
    // o nome vem como "Empresa: Modelo"; sem os dois pontos fica o prefixo do id
    const companies = useMemo(() => [...new Map((models ?? []).map((m) => [companyOf(m), m.name.includes(': ') ? m.name.split(': ')[0] : companyOf(m)]))]
        .sort((a, b) => a[1].localeCompare(b[1])), [models]);
    const currentModel: AiModel | undefined = models?.find((m) => m.id === current);
    const denyData = options.denyData ?? settings?.denyData ?? false;
    const optionsChanged = providerSort !== settings?.providerSort || denyData !== settings?.denyData;
    const modelChanged = !!picked && picked !== settings?.model;
    const saveModel = () => save.mutate({ model: modelChanged ? picked : undefined, providerSort, denyData },
        { onSuccess: () => { setPicked(null); setOptions({}); if (modelChanged) testMutation.mutate(); } });

    if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-text-muted" /></div>;

    return (
        <div className="flex flex-col gap-4 max-w-3xl">
            <Card title="Chave da OpenRouter" bodyClass="gap-4">
                {settings?.keyConfigured ? (
                    <p className="text-sm flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold"><CheckCircle2 size={15} />Configurada</span>
                        <span className="font-mono text-text-muted">…{settings.keyHint}</span>
                    </p>
                ) : null}
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-text-main">{settings?.keyConfigured ? 'Substituir por outra chave' : 'Chave'}</label>
                    <PasswordInput value={newKey} onChange={setNewKey} placeholder="sk-or-v1-…" />
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => { save.mutate({ apiKey: newKey.trim() }, { onSuccess: () => setNewKey('') }); }} disabled={!newKey.trim() || save.isPending}
                        className="px-4 h-9 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold disabled:opacity-50">Guardar chave</button>
                    {settings?.keyConfigured && (
                        <button onClick={() => save.mutate({ clearKey: true })} disabled={save.isPending}
                            className="px-4 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold disabled:opacity-50">Remover chave</button>
                    )}
                </div>
            </Card>

            {settings?.keyConfigured && (
                <>
            <Card title="Modelo" bodyClass="gap-3">
                <label className="flex flex-col gap-2 text-sm font-medium text-text-main">
                    Fornecedor do modelo
                    <select value={providerSort} onChange={(e) => setOptions((o) => ({ ...o, providerSort: e.target.value as ProviderSort }))}
                        className="h-9 rounded-lg border border-border bg-slate-50 px-3 text-sm font-normal text-text-main outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20">
                        {SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-text-main">
                    <input type="checkbox" checked={denyData} onChange={(e) => setOptions((o) => ({ ...o, denyData: e.target.checked }))} />
                    Privacidade
                </label>
                <p className="text-sm">Em uso: {settings?.model ? <><b>{currentModel?.name ?? settings.model}</b> <span className="font-mono text-xs text-text-muted">{settings.model}</span></> : <span className="text-amber-700 font-semibold">nenhum</span>}</p>
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar modelo (nome ou id)"
                        className="w-full pl-8 pr-3 h-9 rounded-lg border border-border bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <select aria-label="Empresa" value={filters.company} onChange={(e) => setFilters((f) => ({ ...f, company: e.target.value }))} className={FILTER_CLASS}>
                        <option value="">Todas as empresas</option>
                        {companies.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    <select aria-label="Preço" value={filters.price} onChange={(e) => setFilters((f) => ({ ...f, price: e.target.value as typeof NO_FILTERS.price }))} className={FILTER_CLASS}>
                        <option value="all">Grátis e pagos</option>
                        <option value="free">Só grátis</option>
                        <option value="paid">Só pagos</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm text-text-main">
                        <input type="checkbox" checked={filters.vision} onChange={(e) => setFilters((f) => ({ ...f, vision: e.target.checked }))} />
                        Só com visão
                    </label>
                </div>
                {loadingModels && <p className="text-sm text-text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" />A carregar modelos…</p>}
                {modelsError && <p className="text-sm text-rose-600">Não foi possível obter a lista da OpenRouter. <button onClick={() => void refetchModels()} className="underline">Tentar de novo</button></p>}
                {models && (
                    <ul className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border" role="listbox" aria-label="Modelos">
                        {shown.map((m) => (
                            <li key={m.id} role="option" aria-selected={m.id === current}>
                                <button type="button" onClick={() => setPicked(m.id)} className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 ${m.id === current ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-slate-50'}`}>
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium text-text-main truncate">{m.name}</span>
                                        <span className="block text-[11px] font-mono text-text-muted truncate">{m.id}</span>
                                    </span>
                                    <span className="shrink-0 flex items-center gap-2 text-[11px] text-text-muted">
                                        {m.vision && <span title="Aceita imagens" className="inline-flex items-center gap-0.5 text-emerald-700"><Eye size={12} />visão</span>}
                                        <span title="Preço por milhão de tokens (entrada / saída)">{price(m.promptPerMillion)} / {price(m.completionPerMillion)}</span>
                                    </span>
                                </button>
                            </li>
                        ))}
                        {shown.length === 0 && <li className="px-3 py-4 text-sm text-text-muted">Nenhum modelo corresponde à pesquisa e aos filtros.</li>}
                    </ul>
                )}
                {matching.length > shown.length && <p className="text-[11px] text-text-muted">A mostrar {shown.length} de {matching.length}; pesquisa ou filtra para ver os outros.</p>}
                <div className="flex flex-wrap gap-2 items-center">
                    <button onClick={saveModel} disabled={(!modelChanged && !optionsChanged) || save.isPending}
                        className="px-4 h-9 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold disabled:opacity-50">Guardar</button>
                    {picked && currentModel && !currentModel.vision && <span className="text-xs text-amber-700">Este modelo não aceita imagens.</span>}
                </div>
                {/* Ao guardar um modelo novo testa-se logo a ligação (chave aceite e modelo existente; não gasta tokens) e diz-se o resultado. */}
                {testMutation.isPending && <p className="text-sm text-text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" />A testar a ligação…</p>}
                {!testMutation.isPending && test && <p className={`text-sm inline-flex items-center gap-1.5 ${test.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{test.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{test.message}</p>}
            </Card>
                </>
            )}
        </div>
    );
}
