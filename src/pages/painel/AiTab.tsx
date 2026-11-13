import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Loader2, Search, Eye, CheckCircle2, XCircle } from 'lucide-react';
import { aiAdminApi, type AiModel } from '../../api/ai-admin-api';
import { PasswordInput } from '../../components/PasswordInput';
import { useNotification } from '../../context/NotificationContext';

const price = (n: number) => (n === 0 ? 'grátis' : `$${n < 1 ? n.toFixed(2) : n.toFixed(1)}`);
const MAX_LISTED = 80; // a lista da OpenRouter tem centenas; a pesquisa afunila

/** Painel → IA: a chave da OpenRouter e o modelo que o assistente usa. A chave nunca volta ao browser. */
export function AiTab() {
    const { showNotification } = useNotification();
    const queryClient = useQueryClient();
    const [newKey, setNewKey] = useState('');
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState<string | null>(null);
    const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

    const { data: settings, isLoading } = useQuery({ queryKey: ['ai-settings'], queryFn: aiAdminApi.getSettings });
    const { data: models, isLoading: loadingModels, isError: modelsError, refetch: refetchModels } = useQuery({
        queryKey: ['ai-models'], queryFn: aiAdminApi.getModels, staleTime: 10 * 60 * 1000, retry: false, enabled: !!settings?.keyConfigured, // sem chave não há modelo a escolher
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
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = (models ?? []).filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
        return list.slice(0, MAX_LISTED);
    }, [models, query]);
    const currentModel: AiModel | undefined = models?.find((m) => m.id === current);

    if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-text-muted" /></div>;

    return (
        <div className="flex flex-col gap-4 max-w-3xl">
            <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-slate-700">Chave da OpenRouter</h2>
                </div>
                <div className="px-6 py-5 flex flex-col gap-4">
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
                </div>
            </div>

            {settings?.keyConfigured && (
                <>
            <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-slate-700">Modelo</h2>
                    <p className="text-xs text-text-muted mt-1">Só aparecem modelos que suportam ferramentas, que o assistente exige. O texto alternativo das imagens precisa de um modelo com visão (<Eye size={11} className="inline -mt-0.5" />).</p>
                </div>
                <div className="px-6 py-5 flex flex-col gap-3">
                    <p className="text-sm">Em uso: {settings?.model ? <><b>{currentModel?.name ?? settings.model}</b> <span className="font-mono text-xs text-text-muted">{settings.model}</span></> : <span className="text-amber-700 font-semibold">nenhum</span>}</p>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar modelo (nome ou id)"
                            className="w-full pl-8 pr-3 h-9 rounded-lg border border-border bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm" />
                    </div>
                    {loadingModels && <p className="text-sm text-text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" />A carregar modelos…</p>}
                    {modelsError && <p className="text-sm text-rose-600">Não foi possível obter a lista da OpenRouter. <button onClick={() => void refetchModels()} className="underline">Tentar de novo</button></p>}
                    {models && (
                        <ul className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border" role="listbox" aria-label="Modelos">
                            {shown.map((m) => (
                                <li key={m.id} role="option" aria-selected={m.id === current}>
                                    <button type="button" onClick={() => setPicked(m.id)} className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 hover:bg-slate-50 ${m.id === current ? 'bg-emerald-50' : ''}`}>
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
                            {shown.length === 0 && <li className="px-3 py-4 text-sm text-text-muted">Nenhum modelo corresponde à pesquisa.</li>}
                        </ul>
                    )}
                    {models && models.length > shown.length && !query && <p className="text-[11px] text-text-muted">A mostrar {shown.length} de {models.length}; pesquisa para ver os outros.</p>}
                    <div className="flex flex-wrap gap-2 items-center">
                        <button onClick={() => { if (picked) save.mutate({ model: picked }, { onSuccess: () => setPicked(null) }); }} disabled={!picked || picked === settings?.model || save.isPending}
                            className="px-4 h-9 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold disabled:opacity-50">Guardar modelo</button>
                        {picked && currentModel && !currentModel.vision && <span className="text-xs text-amber-700">Este modelo não aceita imagens.</span>}
                    </div>
                </div>
            </div>

            <div className="bg-card-bg border border-border rounded-2xl px-6 py-4 flex flex-wrap items-center gap-3">
                <button onClick={() => testMutation.mutate()} disabled={testMutation.isPending || !settings?.keyConfigured}
                    className="px-4 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2">
                    {testMutation.isPending && <Loader2 size={14} className="animate-spin" />}Testar ligação
                </button>
                {test && <span className={`text-sm inline-flex items-center gap-1.5 ${test.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{test.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{test.message}</span>}
                <span className="text-[11px] text-text-muted basis-full">O teste confirma que a chave é aceite e que o modelo existe; não gasta tokens. Usa a chave e o modelo guardados.</span>
            </div>
                </>
            )}
        </div>
    );
}
