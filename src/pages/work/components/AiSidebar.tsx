import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2, Check, ImageIcon, MessageSquare } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { useEditorFrame } from '../hooks/useEditorFrame';
import type { useAiAssistant } from '../ai/useAiAssistant';
import type { useAltReview } from '../ai/useAltReview';
import { AltReview } from './AltReview';

type Ai = ReturnType<typeof useAiAssistant>;
type Alt = ReturnType<typeof useAltReview>;

// O modelo escreve **negrito** e `código`; o painel não é markdown, por isso só estas duas marcas se desenham.
const inline = (text: string): React.ReactNode[] =>
    text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
        part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong>
            : part.startsWith('`') && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code>
                : part);

const ICON = 'p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-all';

export const AiSidebar: React.FC<{ ai: Ai; alt: Alt; isbn: string; readOnly: boolean; onClose: () => void; width: number; onResize: (w: number) => void }> = ({ ai, alt, isbn, readOnly, onClose, width, onResize }) => {
    const frame = useEditorFrame();
    const [text, setText] = useState('');
    const [view, setView] = useState<'chat' | 'alt'>('chat');
    const listRef = useRef<HTMLDivElement>(null);
    // Ao chegar uma resposta (ou a proposta, ou um erro) a lista desce até ao fim.
    useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [ai.lines, ai.proposal, ai.busy, ai.error]);
    const total = ai.proposal?.reports.reduce((n, r) => n + r.changed, 0) ?? 0;
    const submit = () => { if (text.trim()) { void ai.send(text); setText(''); } };

    return (
        <aside style={{ width, ...frame }} className="fixed right-4 top-[var(--wp-header-h,57px)] bottom-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col z-40">
            <PanelResizeHandle width={width} onResize={onResize} />
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <span className="text-sm font-bold text-slate-700">{view === 'alt' ? 'Texto alternativo' : 'Assistente'}</span>
                <div className="flex gap-1">
                    {/* Um só botão para trocar de vista: na conversa mostra a galeria (texto alternativo das imagens); no texto alternativo, o chat. */}
                    <button onClick={() => { if (view === 'chat') alt.load(); setView(view === 'alt' ? 'chat' : 'alt'); }}
                        title={view === 'alt' ? 'Voltar à conversa' : 'Texto alternativo das imagens'} aria-label={view === 'alt' ? 'Voltar à conversa' : 'Texto alternativo das imagens'}
                        className={`${ICON} hover:text-text-main`}>{view === 'alt' ? <MessageSquare size={16} /> : <ImageIcon size={16} />}</button>
                    <button onClick={ai.reset} title="Nova conversa" aria-label="Nova conversa" className={`${ICON} hover:text-text-main`}><Trash2 size={16} /></button>
                    <button onClick={onClose} aria-label="Fechar" className={`${ICON} hover:text-rose-500`}><X size={16} /></button>
                </div>
            </div>

            {view === 'alt' ? (
                <div className="flex-1 min-h-0 overflow-y-auto p-5"><AltReview isbn={isbn} alt={alt} readOnly={readOnly} /></div>
            ) : (
                <>
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-3 text-sm">
                {ai.lines.length === 0 && (
                    <p className="text-text-muted">O que posso ajudar?</p>
                )}
                {ai.lines.map((l, i) => (
                    <div key={i} className={l.role === 'user' ? 'self-end max-w-[85%] rounded-xl bg-slate-700 text-white px-3 py-2' : 'self-start max-w-[90%] rounded-xl bg-slate-100 text-slate-800 px-3 py-2 whitespace-pre-wrap'}>{l.role === 'user' ? l.text : inline(l.text)}</div>
                ))}
                {ai.busy && <p className="text-text-muted">A trabalhar…</p>}
                {ai.error && <p className="text-rose-600">{ai.error}</p>}

                {ai.proposal && (
                    <div className="rounded-xl border border-border p-3 flex flex-col gap-2">
                        <p className="font-bold text-slate-700">Proposta: {total} {total === 1 ? 'bloco' : 'blocos'}{ai.proposal.styles.length > 0 && ` + ${ai.proposal.styles.length} ${ai.proposal.styles.length === 1 ? 'estilo novo' : 'estilos novos'}`}{ai.proposal.opResults.some((o) => o.changed) && ` + ${ai.proposal.opResults.filter((o) => o.changed).length} ${ai.proposal.opResults.filter((o) => o.changed).length === 1 ? 'operação' : 'operações'}`}{ai.proposal.edits.length > 0 && ` + ${ai.proposal.edits.length} ${ai.proposal.edits.length === 1 ? 'estilo alterado' : 'estilos alterados'}`}</p>
                        {ai.proposal.styles.map((s) => (
                            <p key={s.cls} className="text-xs text-slate-600"><span className="font-semibold">Estilo novo</span> <code>.{s.cls}</code> {'{ '}{s.body}{' }'}</p>
                        ))}
                        {ai.proposal.opResults.filter((o) => o.changed).map((o, i) => (
                            <p key={i} className="text-xs text-slate-600"><span className="font-semibold">{o.label}</span>: {o.summary}</p>
                        ))}
                        {ai.proposal.edits.map((e) => (
                            <p key={e.cls} className="text-xs text-slate-600"><span className="font-semibold">Alterar estilo</span> <code>{e.selector}</code>: <span className="text-rose-600">{e.before || '(sem regra)'}</span> → <span className="text-emerald-700">{e.after || '(vazio)'}</span></p>
                        ))}
                        {ai.proposal.reports.map((r, i) => r.changed > 0 && (
                            <div key={i} className="text-xs text-slate-600">
                                <p className="font-semibold">Regra {i + 1}: {r.changed} em {r.chapters.length} {r.chapters.length === 1 ? 'capítulo' : 'capítulos'}</p>
                                {r.samples.map((s, j) => (
                                    <pre key={j} className="mt-1 whitespace-pre-wrap break-words rounded bg-slate-50 p-2"><span className="text-rose-600">{s.before}</span>{'\n'}<span className="text-emerald-700">{s.after || '(removido)'}</span></pre>
                                ))}
                            </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                            <button onClick={() => void ai.apply()} disabled={ai.busy || readOnly} title={readOnly ? 'Modo leitura — outro utilizador está a editar' : undefined}
                                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"><Check size={14} />Aplicar</button>
                            <button onClick={ai.discard} disabled={ai.busy} className="px-3 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold">Descartar</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-3 border-t border-border flex gap-2">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="O que queres alterar no livro?"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                    className="flex-1 resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-slate-400" />
                <button onClick={submit} disabled={ai.busy || !text.trim()} aria-label="Enviar" className="self-end h-9 w-9 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-800 text-white disabled:opacity-50"><Send size={15} /></button>
            </div>
                </>
            )}
        </aside>
    );
};
