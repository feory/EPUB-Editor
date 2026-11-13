import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { aiAdminApi, type UsageRow } from '../../api/ai-admin-api';

const RANGES = [7, 30, 90] as const;
const GROUPS = [['user', 'Utilizador'], ['kind', 'Tipo'], ['model', 'Modelo']] as const;
type Group = typeof GROUPS[number][0];
const KIND_LABEL: Record<string, string> = { chat: 'Conversa', alt: 'Texto alternativo' };
const nf = new Intl.NumberFormat('pt-PT');
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('pt-PT', { maximumFractionDigits: 2 })} M` : n >= 1e4 ? `${(n / 1e3).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} k` : nf.format(n));
const usd = (n: number | null) => (n === null ? '—' : `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`);

const Tile = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
    <div className="rounded-xl border border-border bg-slate-50 px-4 py-3">
        <p className="text-[11px] uppercase tracking-wider text-text-muted">{label}</p>
        <p className="text-xl font-semibold text-slate-800">{value}</p>
        {hint && <p className="text-[11px] text-text-muted">{hint}</p>}
    </div>
);

function Table({ label, rows }: { label: string; rows: (UsageRow & { name: string })[] }) {
    if (rows.length === 0) return null;
    return (
        <div>
            <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-text-muted"><tr>
                        <th className="text-left font-medium px-3 py-2">{label}</th><th className="text-right font-medium px-3 py-2">Chamadas</th>
                        <th className="text-right font-medium px-3 py-2">Entrada</th><th className="text-right font-medium px-3 py-2">Saída</th><th className="text-right font-medium px-3 py-2">Custo</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                        {rows.map((r) => (
                            <tr key={r.name}>
                                <td className="px-3 py-2 text-text-main max-w-[16rem] truncate" title={r.name}>{r.name}</td>
                                <td className="px-3 py-2 text-right">{nf.format(r.calls)}</td>
                                <td className="px-3 py-2 text-right" title={`${nf.format(r.input)} tokens (${nf.format(r.cached)} em cache)`}>{compact(r.input)}</td>
                                <td className="px-3 py-2 text-right" title={`${nf.format(r.output)} tokens`}>{compact(r.output)}</td>
                                <td className="px-3 py-2 text-right">{usd(r.cost)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/** Painel → IA: o consumo REAL (tokens e custo que o fornecedor devolveu em cada chamada), por dia, utilizador, tipo e modelo. */
export function AiUsage() {
    const [days, setDays] = useState<number>(30);
    const [group, setGroup] = useState<Group>('user');
    const { data, isLoading, isError } = useQuery({ queryKey: ['ai-usage', days], queryFn: () => aiAdminApi.getUsage(days), staleTime: 30_000 });
    const max = Math.max(1, ...(data?.byDay.map((d) => d.input + d.output) ?? [0]));
    const t = data?.totals;

    return (
        <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-slate-700">Consumo IA</h2>
                </div>
                <div className="flex rounded-lg border border-border p-0.5 bg-slate-50" role="tablist" aria-label="Período">
                    {RANGES.map((r) => (
                        <button key={r} role="tab" aria-selected={days === r} onClick={() => setDays(r)}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${days === r ? 'bg-white shadow-sm text-slate-800' : 'text-text-muted hover:text-slate-700'}`}>{r} dias</button>
                    ))}
                </div>
            </div>
            <div className="px-6 py-5 flex flex-col gap-6">
                {isLoading && <p className="text-sm text-text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" />A carregar…</p>}
                {isError && <p className="text-sm text-rose-600">Não foi possível carregar o consumo.</p>}
                {data && t && (t.calls === 0 ? <p className="text-sm text-text-muted">Ainda não há consumo registado neste período.</p> : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Tile label="Chamadas" value={nf.format(t.calls)} />
                            <Tile label="Tokens de entrada" value={compact(t.input)} hint={t.cached > 0 ? `${compact(t.cached)} em cache` : undefined} />
                            <Tile label="Tokens de saída" value={compact(t.output)} />
                            <Tile label="Custo" value={usd(t.cost)} hint={t.cost === null ? 'o fornecedor não devolve custo' : t.costCalls < t.calls ? `só ${nf.format(t.costCalls)} de ${nf.format(t.calls)} chamadas têm custo` : undefined} />
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-slate-700 mb-2">Por dia (entrada + saída)</h3>
                            <div className="flex items-end gap-1 h-28" role="img" aria-label="Tokens por dia">
                                {data.byDay.map((d) => (
                                    <div key={d.day} className="flex-1 min-w-[6px] max-w-[48px] bg-slate-700/80 hover:bg-slate-800 rounded-t"
                                        style={{ height: `${Math.max(3, ((d.input + d.output) / max) * 100)}%` }}
                                        title={`${d.day}: ${nf.format(d.calls)} chamadas, ${nf.format(d.input)} entrada, ${nf.format(d.output)} saída, ${usd(d.cost)}`} />
                                ))}
                            </div>
                            <div className="flex justify-between text-[11px] text-text-muted mt-1"><span>{data.byDay[0]?.day}</span><span>{data.byDay.at(-1)?.day}</span></div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                Ver por
                                <select value={group} onChange={(e) => setGroup(e.target.value as Group)}
                                    className="h-9 rounded-lg border border-border bg-slate-50 px-3 text-sm font-normal text-text-main outline-none focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20">
                                    {GROUPS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                </select>
                            </label>
                            <Table label={GROUPS.find(([k]) => k === group)![1]} rows={group === 'user' ? data.byUser.map((r) => ({ ...r, name: r.user }))
                                : group === 'kind' ? data.byKind.map((r) => ({ ...r, name: KIND_LABEL[r.kind] ?? r.kind }))
                                    : data.byModel.map((r) => ({ ...r, name: r.model }))} />
                        </div>
                    </>
                ))}
            </div>
        </div>
    );
}
