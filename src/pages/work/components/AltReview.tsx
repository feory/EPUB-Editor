import React, { useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { imageSrc } from '../../../utils/book-image';
import { TOKENS_PER_IMAGE, isDirty, isPending, type useAltReview } from '../ai/useAltReview';

type Alt = ReturnType<typeof useAltReview>;

const BTN = 'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold disabled:opacity-50';
const MAX_ALT = 125; // acima disto os leitores de ecrã começam a cansar: só avisa, não impede

/** Todas as imagens do livro com o texto alternativo, editável. A IA preenche as que faltam; "Guardar" grava as alterações. */
export const AltReview: React.FC<{ isbn: string; alt: Alt; readOnly: boolean }> = ({ isbn, alt, readOnly }) => {
    const [onlyPending, setOnlyPending] = useState(false);
    const shown = onlyPending ? alt.items.filter(isPending) : alt.items;

    if (alt.phase === 'confirm') {
        const n = alt.generateCount;
        return (
            <div className="flex flex-col gap-3 text-sm">
                <p>Gerar o texto de <b>{n}</b> {n === 1 ? 'imagem sem texto alternativo' : 'imagens sem texto alternativo'}.</p>
                <p className="text-text-muted">Cada imagem (reduzida a 1024 px) e o texto à sua volta serão enviados ao fornecedor de IA configurado. Estimativa: cerca de {(n * TOKENS_PER_IMAGE).toLocaleString('pt-PT')} tokens de entrada. Nada é gravado sem carregares em Guardar.</p>
                <div className="flex gap-2">
                    <button onClick={() => void alt.generate()} className={`${BTN} bg-emerald-600 hover:bg-emerald-700 text-white`}>Enviar e gerar</button>
                    <button onClick={alt.cancelConfirm} className={`${BTN} bg-slate-100 hover:bg-slate-200 text-slate-600`}>Cancelar</button>
                </div>
            </div>
        );
    }
    if (alt.phase === 'running') {
        return (
            <div className="flex flex-col gap-3 text-sm">
                <p className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" />A gerar… {alt.done} de {alt.generateCount}</p>
                <button onClick={alt.cancel} className={`${BTN} self-start bg-slate-100 hover:bg-slate-200 text-slate-600`}>Parar</button>
            </div>
        );
    }
    if (alt.items.length === 0) return <p className="text-sm text-text-muted">Este livro não tem imagens.</p>;

    return (
        <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p><b>{alt.items.length}</b> {alt.items.length === 1 ? 'imagem' : 'imagens'} · <span className={alt.pendingCount ? 'text-amber-700 font-semibold' : 'text-emerald-700'}>{alt.pendingCount} sem texto</span></p>
                <label className="inline-flex items-center gap-1.5 text-xs text-text-muted"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />Só as sem texto</label>
            </div>
            {alt.generateCount > 0 && (
                <button onClick={alt.askGenerate} disabled={readOnly} className={`${BTN} self-start bg-slate-100 hover:bg-slate-200 text-slate-700`}><Sparkles size={14} />Gerar com IA as {alt.generateCount} sem texto</button>
            )}
            {alt.message && <p className={alt.message.startsWith('Não') ? 'text-rose-600' : 'text-emerald-700'}>{alt.message}</p>}

            <ul className="flex flex-col gap-3">
                {shown.map((it) => {
                    const dirty = isDirty(it);
                    return (
                        <li key={it.id} className={`rounded-xl border p-3 flex gap-3 ${dirty ? 'border-emerald-300 bg-emerald-50/40' : isPending(it) ? 'border-amber-300 bg-amber-50/40' : 'border-border'}`}>
                            <img src={`${imageSrc(isbn, it.id)}?thumbnail=true`} alt="" loading="lazy" className="w-20 h-20 object-contain rounded bg-slate-100 shrink-0" />
                            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                                <p className="text-[11px] text-text-muted truncate">
                                    {it.chapter} · {it.count > 1 ? `${it.count} usos` : '1 uso'}
                                    {isPending(it) && <span className="ml-1.5 text-amber-700 font-semibold">sem texto</span>}
                                    {dirty && <span className="ml-1.5 text-emerald-700 font-semibold">alterada</span>}
                                </p>
                                <textarea rows={2} aria-label="Texto alternativo" value={it.draftDecorative ? '' : it.draftAlt} disabled={it.draftDecorative} readOnly={readOnly}
                                    placeholder={it.draftDecorative ? 'Decorativa (sem texto)' : 'Descreve a imagem para leitores de ecrã'}
                                    onChange={(e) => alt.patch(it.id, { draftAlt: e.target.value })}
                                    className="w-full resize-none rounded-lg border border-border bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-400 disabled:bg-slate-50" />
                                {it.error && <p className="text-xs text-rose-600">{it.error}</p>}
                                {it.mixed && <p className="text-[11px] text-amber-700">Os usos têm textos diferentes; guardar uniformiza-os.</p>}
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <button type="button" onClick={() => void alt.generateOne(it.id)} disabled={readOnly || alt.busyIds.includes(it.id) || alt.phase !== 'idle'}
                                        title="Envia esta imagem e o texto à volta ao fornecedor de IA"
                                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 disabled:opacity-50">
                                        {alt.busyIds.includes(it.id) ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}Gerar
                                    </button>
                                    <label className="inline-flex items-center gap-1"><input type="checkbox" checked={it.draftDecorative} disabled={readOnly} onChange={(e) => alt.patch(it.id, { draftDecorative: e.target.checked })} />Decorativa</label>
                                    {!it.draftDecorative && <span className={it.draftAlt.length > MAX_ALT ? 'text-amber-700' : 'text-text-muted'}>{it.draftAlt.length}/{MAX_ALT}</span>}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>

            <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-surface border-t border-border flex gap-2">
                <button onClick={() => void alt.save()} disabled={alt.phase === 'saving' || alt.dirtyCount === 0 || readOnly} title={readOnly ? 'Modo leitura — outro utilizador está a editar' : undefined}
                    className={`${BTN} bg-emerald-600 hover:bg-emerald-700 text-white`}><Check size={14} />Guardar {alt.dirtyCount > 0 ? alt.dirtyCount : ''}</button>
                <button onClick={alt.discard} disabled={alt.phase === 'saving' || alt.dirtyCount === 0} className={`${BTN} bg-slate-100 hover:bg-slate-200 text-slate-600`}>Descartar alterações</button>
            </div>
        </div>
    );
};
