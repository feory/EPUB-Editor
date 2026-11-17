import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2, Check, ImageIcon, MessageSquare, History, Download } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { useEditorFrame } from '../hooks/useEditorFrame';
import type { useAiAssistant } from '../ai/useAiAssistant';
import type { useAltReview } from '../ai/useAltReview';
import { AltReview } from './AltReview';
import type { useAiChanges } from '../ai/useAiChanges';
import { ChangesView } from './ChangesView';
import { charStyles, paragraphStyles } from '../../../utils/user-styles';
import { recallStep, recalled } from '../ai/promptHistory';
import { splitLinks } from '../ai/aiLinks';

type Ai = ReturnType<typeof useAiAssistant>;
type Alt = ReturnType<typeof useAltReview>;
type Changes = ReturnType<typeof useAiChanges>;
type View = 'chat' | 'alt' | 'changes';
const TITLES: Record<View, string> = { chat: 'Assistente', alt: 'Texto alternativo', changes: 'Alterações da IA' };

// O modelo escreve **negrito**, `código` e [[cap:N,bloco:M]] (botão que salta para o sítio); o painel não é markdown, por isso só se desenham estas marcas.
const inline = (text: string, go?: (chapter: number, block?: number) => void, titles: string[] = []): React.ReactNode[] =>
    splitLinks(text).flatMap((piece, k) => typeof piece !== 'string'
        ? [<button key={`l${k}`} onClick={() => go?.(piece.chapter, piece.block)} title={titles[piece.chapter] ?? undefined}
            className="mx-0.5 inline-flex items-center rounded-md bg-sky-50 hover:bg-sky-100 border border-sky-200 px-1.5 py-0.5 text-xs font-semibold text-sky-800 align-baseline">
            Cap. {piece.chapter}{titles[piece.chapter] ? ` · ${titles[piece.chapter].replace(/^\[hidden\]/, '').slice(0, 24)}` : ''} ▸</button>]
        : piece.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
            part.startsWith('**') ? <strong key={`${k}.${i}`}>{part.slice(2, -2)}</strong>
                : part.startsWith('`') && part.length > 2 ? <code key={`${k}.${i}`}>{part.slice(1, -1)}</code>
                    : part));

/** Estilo novo da proposta, com o nome editável (a classe troca-se em todo o lado onde a proposta a usa). */
const NewStyleRow: React.FC<{ cls: string; body: string; onRename: (name: string) => string | null; disabled: boolean }> = ({ cls, body, onRename, disabled }) => {
    const kind = charStyles.isStyle(cls) ? charStyles : paragraphStyles;
    const [draft, setDraft] = useState<string | null>(null);
    const [error, setError] = useState('');
    const commit = () => {
        if (draft === null) return;
        const err = onRename(draft);
        setError(err ?? '');
        if (!err) setDraft(null);
    };
    return (
        <div className="text-xs text-slate-600 flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">Estilo novo</span>
                {kind === charStyles && <span className="text-text-muted">c-</span>}
                <input aria-label="Nome do estilo" value={draft ?? kind.label(cls)} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') { setDraft(null); setError(''); } }}
                    className="h-6 w-36 rounded border border-border bg-white px-1.5 font-mono outline-none focus:border-slate-400" />
                <span className="text-text-muted">{'{ '}{body}{' }'}</span>
            </div>
            {error && <span className="text-rose-600">{error}</span>}
        </div>
    );
};

/** Descarrega o relatório como .txt (com BOM, para o Bloco de Notas do Windows ler os acentos). */
function downloadReport(text: string, isbn: string) {
    const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `relatorio-${isbn}-${new Date().toISOString().slice(0, 10)}.txt` });
    a.click();
    URL.revokeObjectURL(url);
}

const ICON = 'p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-all';

export const AiSidebar: React.FC<{ ai: Ai; chapterTitles: string[]; onGoTo: (chapter: number, block?: number) => void; alt: Alt; changes: Changes; isbn: string; readOnly: boolean; onClose: () => void; width: number; onResize: (w: number) => void }> = ({ ai, chapterTitles, onGoTo, alt, changes, isbn, readOnly, onClose, width, onResize }) => {
    const frame = useEditorFrame();
    const [text, setText] = useState('');
    const [view, setView] = useState<View>('chat');
    // ↑/↓ recuperam os pedidos anteriores; `recall` = quantos para trás (null = o rascunho, guardado em `draft`).
    const [recall, setRecall] = useState<number | null>(null);
    const draft = useRef('');
    const go = (next: View) => { if (next === 'alt') alt.load(); setView(next); };
    const listRef = useRef<HTMLDivElement>(null);
    // Ao chegar uma resposta (ou a proposta, ou um erro) a lista desce até ao fim.
    useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [ai.lines, ai.proposal, ai.busy, ai.error]);
    const total = ai.proposal?.reports.reduce((n, r) => n + r.changed, 0) ?? 0;
    // Se o pedido não correu (erro, cancelado), o texto volta à caixa para não ter de se reescrever (sem pisar o que entretanto se escreveu).
    const submit = () => { const sent = text; if (sent.trim()) { void ai.send(sent).then((ok) => { if (!ok) setText((now) => now || sent); }); setText(''); setRecall(null); } };
    // ↑ no início da caixa (ou ↓ no fim) percorre os pedidos anteriores; noutro sítio as setas movem o cursor como sempre.
    const browse = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const dir = e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowDown' ? 'down' : null;
        const el = e.currentTarget;
        if (!dir || e.shiftKey || el.selectionStart !== el.selectionEnd) return;
        if (dir === 'up' ? el.selectionStart !== 0 : el.selectionStart !== el.value.length || recall === null) return;
        const prompts = ai.lines.filter((l) => l.role === 'user').map((l) => l.text);
        const next = recallStep(prompts.length, recall, dir);
        if (next === recall) return;
        e.preventDefault();
        if (recall === null) draft.current = text;
        setRecall(next);
        const value = recalled(prompts, next, draft.current);
        setText(value);
        // o cursor fica no sítio de onde a seta seguinte continua (↑ no início, ↓ no fim), também em pedidos de várias linhas
        requestAnimationFrame(() => { const at = dir === 'up' ? 0 : value.length; el.setSelectionRange(at, at); });
    };

    return (
        <aside data-ai-sidebar style={{ width, ...frame }} className="fixed right-4 top-[var(--wp-header-h,57px)] bottom-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col z-40">
            <PanelResizeHandle width={width} onResize={onResize} />
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <span className="text-sm font-bold text-slate-700">{TITLES[view]}</span>
                <div className="flex gap-1">
                    {/* Um botão por cada OUTRA vista: no chat a galeria (texto alternativo) e o registo; fora do chat, o chat. */}
                    {view !== 'chat' && <button onClick={() => go('chat')} title="Voltar à conversa" aria-label="Voltar à conversa" className={`${ICON} hover:text-text-main`}><MessageSquare size={16} /></button>}
                    {view !== 'alt' && <button onClick={() => go('alt')} title="Texto alternativo das imagens" aria-label="Texto alternativo das imagens" className={`${ICON} hover:text-text-main`}><ImageIcon size={16} /></button>}
                    {view !== 'changes' && <button onClick={() => go('changes')} title="Alterações da IA (reverter)" aria-label="Alterações da IA" className={`${ICON} hover:text-text-main`}><History size={16} /></button>}
                    {view === 'chat' && <button onClick={ai.reset} title="Nova conversa" aria-label="Nova conversa" className={`${ICON} hover:text-text-main`}><Trash2 size={16} /></button>}
                    <button onClick={onClose} aria-label="Fechar" className={`${ICON} hover:text-rose-500`}><X size={16} /></button>
                </div>
            </div>

            {view === 'alt' ? (
                <div className="flex-1 min-h-0 overflow-y-auto p-5"><AltReview isbn={isbn} alt={alt} readOnly={readOnly} /></div>
            ) : view === 'changes' ? (
                <div className="flex-1 min-h-0 overflow-y-auto p-5"><ChangesView changes={changes} readOnly={readOnly} /></div>
            ) : (
                <>
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-3 text-sm">
                {ai.lines.length === 0 && (
                    <p className="text-text-muted">O que posso ajudar?</p>
                )}
                {ai.lines.map((l, i) => (
                    <div key={i} className={l.role === 'user' ? 'self-end max-w-[85%] rounded-xl bg-slate-700 text-white px-3 py-2' : 'self-start max-w-[90%] rounded-xl bg-slate-100 text-slate-800 px-3 py-2 whitespace-pre-wrap'}>{l.role === 'user' ? l.text : inline(l.text, onGoTo, chapterTitles)}</div>
                ))}
                {ai.busy && <p className="text-text-muted flex items-center gap-2">{ai.step || 'A trabalhar…'} <button onClick={ai.stop} className="px-2 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold">Parar</button></p>}
                {ai.error && <p className="text-rose-600">{ai.error}</p>}

                {!ai.busy && !ai.proposal && ai.suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {ai.suggestions.map((s) => (
                            <button key={s.label} onClick={() => void ai.send(s.prompt)} disabled={readOnly && s.edits}
                                className="px-3 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold disabled:opacity-50">{s.label}</button>
                        ))}
                    </div>
                )}

                {ai.report && (
                    <div className="rounded-xl border border-border p-3 flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-600"><span className="font-semibold">Relatório pronto</span> ({ai.report.split('\n').length} linhas)</p>
                        <button onClick={() => downloadReport(ai.report!, isbn)} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold"><Download size={14} />Descarregar .txt</button>
                    </div>
                )}

                {ai.proposal && (
                    <div className="rounded-xl border border-border p-3 flex flex-col gap-2">
                        <p className="font-bold text-slate-700">Proposta: {total} {total === 1 ? 'bloco' : 'blocos'}{ai.proposal.styles.length > 0 && ` + ${ai.proposal.styles.length} ${ai.proposal.styles.length === 1 ? 'estilo novo' : 'estilos novos'}`}{ai.proposal.opResults.some((o) => o.changed) && ` + ${ai.proposal.opResults.filter((o) => o.changed).length} ${ai.proposal.opResults.filter((o) => o.changed).length === 1 ? 'operação' : 'operações'}`}{ai.proposal.edits.length > 0 && ` + ${ai.proposal.edits.length} ${ai.proposal.edits.length === 1 ? 'estilo alterado' : 'estilos alterados'}`}{ai.proposal.removals.length > 0 && ` + ${ai.proposal.removals.length} ${ai.proposal.removals.length === 1 ? 'estilo apagado' : 'estilos apagados'}`}</p>
                        {ai.proposal.styles.map((s) => (
                            <NewStyleRow key={s.cls} cls={s.cls} body={s.body} disabled={ai.busy} onRename={(name) => ai.renameStyle(s.cls, name)} />
                        ))}
                        {ai.proposal.opResults.filter((o) => o.changed).map((o, i) => (
                            <p key={i} className="text-xs text-slate-600"><span className="font-semibold">{o.label}</span>: {o.summary}</p>
                        ))}
                        {ai.proposal.removals.map((cls) => (
                            <p key={cls} className="text-xs text-slate-600"><span className="font-semibold">Apagar estilo</span> <code>.{cls}</code> <span className="text-text-muted">(ninguém o usa)</span></p>
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

            {ai.scoped && (
                <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs text-amber-900">
                    <span className="min-w-0 flex-1 truncate"><b>{ai.scoped.texts.length === 1 ? 'Só o bloco destacado' : `Só os ${ai.scoped.texts.length} blocos destacados`}</b> no editor</span>
                    <button onClick={ai.clearScope} aria-label="Pedir para o livro todo" title="Pedir para o livro todo" className="shrink-0 p-0.5 rounded hover:bg-amber-100"><X size={12} /></button>
                </div>
            )}
            <div className="p-3 border-t border-border flex gap-2">
                <textarea value={text} onChange={(e) => { setText(e.target.value); setRecall(null); }} rows={2} placeholder={ai.scoped ? (ai.scoped.texts.length === 1 ? 'O que queres alterar neste bloco?' : 'O que queres alterar nestes blocos?') : 'O que queres alterar no livro?'}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } else browse(e); }}
                    className="flex-1 resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-slate-400" />
                <button onClick={submit} disabled={ai.busy || !text.trim()} aria-label="Enviar" className="self-end h-9 w-9 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-800 text-white disabled:opacity-50"><Send size={15} /></button>
            </div>
                </>
            )}
        </aside>
    );
};
