import React, { useState } from 'react';
import { Loader2, Undo2, Redo2 } from 'lucide-react';
import type { AiChange } from '../../../api/ebooks-api';
import type { useAiChanges } from '../ai/useAiChanges';

type Changes = ReturnType<typeof useAiChanges>;

const when = (iso: string) => new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
const BTN = 'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold disabled:opacity-50';

/** Registo das alterações que a IA aplicou ao livro, com Reverter (repõe o HTML e/ou o CSS de antes dela). */
export const ChangesView: React.FC<{ changes: Changes; readOnly: boolean }> = ({ changes, readOnly }) => {
    const [confirming, setConfirming] = useState<string | null>(null);

    if (changes.isLoading) return <p className="text-sm text-text-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" />A carregar…</p>;
    if (changes.isError) return <p className="text-sm text-rose-600">Não foi possível carregar o registo.</p>;
    if (changes.changes.length === 0) return <p className="text-sm text-text-muted">Ainda não há alterações da IA neste livro.</p>;

    const revert = async (c: AiChange) => { await (c.revertedAt ? changes.restoreChange(c) : changes.revertChange(c)); setConfirming(null); };
    return (
        <ul className="flex flex-col gap-3 text-sm">
            {changes.changes.map((c) => (
                <li key={c.id} className={`rounded-xl border p-3 flex flex-col gap-1.5 ${c.revertedAt ? 'border-border bg-slate-50 text-text-muted' : 'border-border'}`}>
                    <p className="text-[11px] text-text-muted">{when(c.at)} · {c.by}</p>
                    <p className="font-medium text-text-main">{c.request}</p>
                    {c.lines.length > 0 && <ul className="text-xs text-slate-600 list-disc pl-4 space-y-0.5">{c.lines.map((l, i) => <li key={i} className="break-words">{l}</li>)}</ul>}
                    <p className="text-[11px] text-text-muted">{[c.htmlFile && 'texto', c.cssFile && 'estilos'].filter(Boolean).join(' + ')}</p>
                    {c.revertedAt && <p className="text-xs text-amber-700 font-semibold">Revertida por {c.revertedBy} em {when(c.revertedAt)}</p>}
                    {confirming === c.id ? (
                        <div className="flex flex-col gap-2 pt-1">
                            <p className="text-xs text-slate-700">{c.revertedAt ? 'Repõe o livro como estava quando esta alteração foi revertida.' : 'Repõe o livro como estava antes desta alteração.'} O que editaste depois perde-se, mas o estado atual fica guardado no histórico.</p>
                            <div className="flex gap-2">
                                <button onClick={() => void revert(c)} disabled={changes.busyId === c.id} className={`${BTN} bg-rose-600 hover:bg-rose-700 text-white`}>
                                    {changes.busyId === c.id && <Loader2 size={12} className="animate-spin" />}Confirmar
                                </button>
                                <button onClick={() => setConfirming(null)} disabled={changes.busyId === c.id} className={`${BTN} bg-slate-100 hover:bg-slate-200 text-slate-600`}>Cancelar</button>
                            </div>
                        </div>
                    ) : c.revertedAt && !c.restoreHtmlFile && !c.restoreCssFile ? null : (
                        <button onClick={() => setConfirming(c.id)} disabled={readOnly || changes.busyId !== null} title={readOnly ? 'Modo leitura — outro utilizador está a editar' : undefined}
                            className={`${BTN} self-start bg-slate-100 hover:bg-slate-200 text-slate-700`}>{c.revertedAt ? <><Redo2 size={12} />Repor</> : <><Undo2 size={12} />Reverter</>}</button>
                    )}
                </li>
            ))}
        </ul>
    );
};
