import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { imageSrc } from '../../../utils/book-image';
import { TOKENS_PER_IMAGE, isDirty, isPending, type useAltReview } from '../ai/useAltReview';

type Alt = ReturnType<typeof useAltReview>;

const BTN = 'inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold disabled:opacity-50';
const MAX_ALT = 125; // acima disto os leitores de ecrã começam a cansar: só avisa, não impede

/** A imagem em grande (clicar fora, Esc ou × fecham). */
const Zoom: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => {
    useBodyScrollLock();
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    return createPortal(
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8" onClick={onClose}>
            <button onClick={onClose} aria-label="Fechar" className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white"><X size={24} /></button>
            <img src={src} alt="" onClick={(e) => e.stopPropagation()} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>, document.body);
};

/** Todas as imagens do livro com o texto alternativo, editável. A IA preenche as que faltam; "Guardar" grava as alterações. */
export const AltReview: React.FC<{ isbn: string; alt: Alt; readOnly: boolean }> = ({ isbn, alt, readOnly }) => {
    const [onlyPending, setOnlyPending] = useState(false);
    const [zoomId, setZoomId] = useState<string | null>(null);
    const shown = onlyPending ? alt.items.filter(isPending) : alt.items;

    if (alt.phase === 'confirm' && alt.regenerateAll) {
        const n = alt.generateCount;
        return (
            <div className="flex flex-col gap-3 text-sm">
                <p>Tens a certeza de que queres gerar de novo o texto alternativo de {n === 1 ? 'a' : <>todas as <b>{n}</b></>} {n === 1 ? 'imagem' : 'imagens'}?</p>
                <div className="flex gap-2">
                    <button onClick={() => void alt.generate()} className={`${BTN} bg-emerald-600 hover:bg-emerald-700 text-white`}>Sim, gerar de novo</button>
                    <button onClick={alt.cancelConfirm} className={`${BTN} bg-slate-100 hover:bg-slate-200 text-slate-600`}>Cancelar</button>
                </div>
            </div>
        );
    }
    if (alt.phase === 'confirm') {
        const n = alt.generateCount;
        return (
            <div className="flex flex-col gap-3 text-sm">
                <p>{alt.regenerateAll ? <>Gerar de novo o texto de <b>{n}</b> {n === 1 ? 'imagem' : 'imagens'}, mesmo as que já têm texto (os rascunhos atuais são substituídos).</> : <>Gerar o texto de <b>{n}</b> {n === 1 ? 'imagem sem texto alternativo' : 'imagens sem texto alternativo'}.</>}</p>
                <p className="text-text-muted">Cada imagem (reduzida a 1024 px) e o texto à sua volta serão enviados ao fornecedor de IA configurado. Estimativa: cerca de {(n * TOKENS_PER_IMAGE).toLocaleString('pt-PT')} tokens de entrada. Nada é gravado sem carregares em Guardar.</p>
                <div className="flex gap-2">
                    <button onClick={() => void alt.generate()} className={`${BTN} bg-emerald-600 hover:bg-emerald-700 text-white`}>Enviar e gerar</button>
                    <button onClick={alt.cancelConfirm} className={`${BTN} bg-slate-100 hover:bg-slate-200 text-slate-600`}>Cancelar</button>
                </div>
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
            <div className="flex flex-wrap gap-2">
                {alt.phase === 'running' && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 border border-border px-3 py-2">
                    <p className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" />A gerar… {alt.done} de {alt.generateCount}</p>
                    <button onClick={alt.cancel} className={`${BTN} bg-slate-100 hover:bg-slate-200 text-slate-600`}>Parar</button>
                </div>
            )}
            {alt.suggestCount > 0 && <p className="text-xs text-amber-700 font-semibold">{alt.suggestCount} {alt.suggestCount === 1 ? 'texto gerado por validar' : 'textos gerados por validar'}: aceita ou rejeita cada um.</p>}
            {alt.generateCount > 0 && !alt.regenerateAll && (
                    <button onClick={() => alt.askGenerate()} disabled={readOnly || alt.phase !== 'idle'} className={`${BTN} bg-slate-100 hover:bg-slate-200 text-slate-700`}><Sparkles size={14} />Gerar com IA as {alt.generateCount} sem texto</button>
                )}
                <button onClick={() => alt.askGenerate(true)} disabled={readOnly || alt.phase !== 'idle'} className={`${BTN} bg-slate-100 hover:bg-slate-200 text-slate-700`}><Sparkles size={14} />Gerar de novo em todas ({alt.items.length})</button>
            </div>
            {alt.message && <p className={alt.message.startsWith('Não') ? 'text-rose-600' : 'text-emerald-700'}>{alt.message}</p>}

            <ul className="flex flex-col gap-3">
                {shown.map((it) => {
                    const dirty = isDirty(it);
                    return (
                        <li key={it.id} className={`rounded-xl border p-3 flex gap-3 ${dirty ? 'border-emerald-300 bg-emerald-50/40' : isPending(it) ? 'border-amber-300 bg-amber-50/40' : 'border-border'}`}>
                            <button type="button" onClick={() => setZoomId(it.id)} aria-label="Ver imagem em grande" title="Ver em grande" className="shrink-0 cursor-zoom-in">
                                <img src={`${imageSrc(isbn, it.id)}?thumbnail=true`} alt="" loading="lazy" className="w-20 h-20 object-contain rounded bg-slate-100" />
                            </button>
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
                {it.suggest && (
                                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs flex flex-col gap-1.5">
                                        <p className="text-[11px] font-semibold text-amber-800">Texto gerado</p>
                                        <p>{it.suggest.decorative ? <i>Decorativa (sem texto)</i> : it.suggest.alt}</p>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => alt.accept(it.id)} disabled={readOnly} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"><Check size={12} />Aceitar</button>
                                            <button type="button" onClick={() => alt.reject(it.id)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"><X size={12} />Rejeitar</button>
                                        </div>
                                    </div>
                                )}
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

            {zoomId && <Zoom src={imageSrc(isbn, zoomId)} onClose={() => setZoomId(null)} />}

            <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-surface border-t border-border flex gap-2">
                <button onClick={() => void alt.save()} disabled={alt.phase !== 'idle' || alt.dirtyCount === 0 || readOnly} title={readOnly ? 'Modo leitura — outro utilizador está a editar' : undefined}
                    className={`${BTN} bg-emerald-600 hover:bg-emerald-700 text-white`}><Check size={14} />Guardar {alt.dirtyCount > 0 ? alt.dirtyCount : ''}</button>
                <button onClick={alt.discard} disabled={alt.phase === 'saving' || alt.dirtyCount === 0} className={`${BTN} bg-slate-100 hover:bg-slate-200 text-slate-600`}>Descartar alterações</button>
            </div>
        </div>
    );
};
