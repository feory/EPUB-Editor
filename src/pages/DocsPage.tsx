import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, X, Info, Pencil, Loader2 } from 'lucide-react';
import { docsApi } from '../api/docs-api';
import { useAuth } from '../context/AuthContext';
import { parseDoc, sectionText, fold, type Block, type Doc, type Inline, type Section } from './docs/markdown';
import editorMd from './docs/content/editor.md?raw';
import comofazerMd from './docs/content/comofazer.md?raw';
import assistenteMd from './docs/content/assistente.md?raw';

// O texto de origem vem do código; o que o administrador editar na página (guardado no servidor) passa à frente.
const DOCS = [
    { id: 'editor', label: 'Funcionalidades do editor', original: editorMd },
    { id: 'comofazer', label: 'Instruções', original: comofazerMd },
    { id: 'assistente', label: 'Assistente de IA', original: assistenteMd },
] as const;
type DocId = typeof DOCS[number]['id'];

const Inlines: React.FC<{ c: Inline[]; onDoc: (id: DocId) => void }> = ({ c, onDoc }) => (
    <>
        {c.map((x, i) => {
            switch (x.t) {
                case 'text': return <React.Fragment key={i}>{x.v}</React.Fragment>;
                case 'b': return <strong key={i} className="font-semibold text-slate-800"><Inlines c={x.c} onDoc={onDoc} /></strong>;
                case 'code': return <code key={i} className="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">{x.v}</code>;
                case 'link': {
                    const target = x.href.startsWith('doc:') ? x.href.slice(4) as DocId : null;
                    return target
                        ? <button key={i} onClick={() => onDoc(target)} className="text-primary font-semibold hover:underline"><Inlines c={x.c} onDoc={onDoc} /></button>
                        : <a key={i} href={x.href} target="_blank" rel="noreferrer" className="text-primary font-semibold hover:underline"><Inlines c={x.c} onDoc={onDoc} /></a>;
                }
                case 'i': {
                    // Uma frase para escrever ao assistente: aparece como um balão, para se distinguir do resto do texto.
                    const text = x.c[0]?.t === 'text' ? x.c[0].v : '';
                    return text.startsWith('«')
                        ? <span key={i} className="inline-block rounded-lg bg-slate-700 px-2 py-0.5 text-white not-italic">{text}</span>
                        : <em key={i}><Inlines c={x.c} onDoc={onDoc} /></em>;
                }
            }
        })}
    </>
);

const BlockView: React.FC<{ b: Block; onDoc: (id: DocId) => void }> = ({ b, onDoc }) => {
    switch (b.t) {
        case 'h3': return <h3 className="mt-2 text-sm font-bold text-slate-700">{b.text}</h3>;
        case 'p': return <p className="leading-relaxed"><Inlines c={b.c} onDoc={onDoc} /></p>;
        case 'quote': return (
            <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-900">
                <Info size={16} className="mt-0.5 shrink-0" /><p className="leading-relaxed"><Inlines c={b.c} onDoc={onDoc} /></p>
            </div>
        );
        case 'ul': case 'ol': {
            const List = b.t;
            return (
                <List className={`${b.t === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 flex flex-col gap-1.5 leading-relaxed marker:text-text-muted`}>
                    {b.items.map((it, i) => <li key={i}><Inlines c={it} onDoc={onDoc} /></li>)}
                </List>
            );
        }
        case 'table': return (
            <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-[13px]">
                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-text-muted">
                        <tr>{b.head.map((h, i) => <th key={i} className="px-3 py-2"><Inlines c={h} onDoc={onDoc} /></th>)}</tr>
                    </thead>
                    <tbody>
                        {b.rows.map((r, i) => (
                            <tr key={i} className="border-t border-border align-top">
                                {r.map((c, j) => <td key={j} className="px-3 py-2 leading-relaxed"><Inlines c={c} onDoc={onDoc} /></td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }
};

const SectionView: React.FC<{ s: Section; badge?: string; onDoc: (id: DocId) => void }> = ({ s, badge, onDoc }) => (
    <section id={s.id} className="scroll-mt-6 rounded-2xl border border-border bg-surface p-6 flex flex-col gap-3 text-sm text-slate-700">
        <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-800">{s.title}</h2>
            {badge && <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-text-muted">{badge}</span>}
            {s.admin && <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-text-muted">Administradores</span>}
        </div>
        {s.blocks.map((b, i) => <BlockView key={i} b={b} onDoc={onDoc} />)}
    </section>
);

/** Um guia desenhado: título e introdução (se houver) e as secções. Serve a leitura e a pré-visualização da edição. */
const GuideBody: React.FC<{ doc: Doc; isAdmin: boolean; onDoc: (id: DocId) => void }> = ({ doc, isAdmin, onDoc }) => (
    <div className="min-w-0 flex-1 flex flex-col gap-4">
        {doc.title && (
            <div className="flex flex-col gap-2 text-sm text-slate-700">
                <h2 className="text-2xl font-bold text-slate-800">{doc.title}</h2>
                {doc.lead.map((b, i) => <BlockView key={i} b={b} onDoc={onDoc} />)}
            </div>
        )}
        {doc.sections.filter((s) => isAdmin || !s.admin).map((s) => <SectionView key={s.id} s={s} onDoc={onDoc} />)}
    </div>
);

const BTN = 'inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-bold disabled:opacity-50';

/** Guias de utilização: o texto vive em `docs/content/*.md`; esta página desenha-o (índice, pesquisa, balões de exemplo) e o administrador edita-o aqui. */
export const DocsPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const isAdmin = user?.role === 'admin';
    const [current, setCurrent] = useState<DocId>('editor');
    const [query, setQuery] = useState('');
    const [draft, setDraft] = useState<string | null>(null); // texto em edição (null = a ler)
    const [error, setError] = useState('');

    const { data: edited } = useQuery({ queryKey: ['docs'], queryFn: docsApi.list });
    const docs = useMemo(() => DOCS.map((d) => ({ ...d, doc: parseDoc(edited?.[d.id] ?? d.original, d.id) })), [edited]);
    const guide = docs.find((d) => d.id === current)!;
    const isEdited = !!edited?.[current];

    const saved = { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['docs'] }); setDraft(null); setError(''); }, onError: () => setError('Não foi possível guardar.') };
    const save = useMutation({ mutationFn: (content: string) => docsApi.save(current, content), ...saved });
    const reset = useMutation({ mutationFn: () => docsApi.reset(current), ...saved });
    const preview = useMemo(() => (draft === null ? null : parseDoc(draft, current)), [draft, current]);
    const busy = save.isPending || reset.isPending;

    const visible = (s: Section) => isAdmin || !s.admin;
    const q = fold(query.trim());
    const hits = useMemo(
        // Os resultados do separador aberto vêm primeiro; os outros guias seguem na ordem dos separadores.
        () => (q ? [...docs].sort((a, b) => Number(b.id === current) - Number(a.id === current))
            .flatMap((d) => d.doc.sections.filter(visible).filter((s) => fold(sectionText(s)).includes(q)).map((s) => ({ s, label: d.label }))) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `visible` só depende de isAdmin
        [q, isAdmin, current, docs],
    );
    const switchTo = (id: DocId) => { if (draft !== null && !window.confirm('Descartar as alterações por guardar?')) return; setDraft(null); setError(''); setQuery(''); setCurrent(id); window.scrollTo({ top: 0 }); };
    const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const startEdit = () => { setQuery(''); setError(''); setDraft(edited?.[current] ?? DOCS.find((d) => d.id === current)!.original); };
    const restore = () => { if (window.confirm('Repor a versão original deste guia? As tuas edições perdem-se.')) reset.mutate(); };

    return (
        <div className="min-h-screen bg-bg-color px-4 py-8">
            <div className="max-w-6xl mx-auto flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} aria-label="Voltar"
                        className="p-2 rounded-lg hover:bg-card-bg border border-transparent hover:border-border transition-colors">
                        <ChevronLeft size={18} className="text-text-muted" />
                    </button>
                    <h1 className="text-xl font-bold text-slate-700">Documentação</h1>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
                    <div className="flex items-center gap-1">
                        {docs.map((d) => (
                            <button key={d.id} onClick={() => switchTo(d.id)}
                                className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${!q && current === d.id ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}>
                                {d.label}
                            </button>
                        ))}
                    </div>
                    <div className="mb-2 flex w-full items-center gap-2 sm:w-auto">
                        {draft === null && (
                            <div className="relative w-full sm:w-72">
                                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar na documentação…" aria-label="Pesquisar na documentação"
                                    className="h-9 w-full rounded-lg border border-border bg-white pl-8 pr-8 text-sm outline-none focus:border-slate-400" />
                                {query && <button onClick={() => setQuery('')} aria-label="Limpar pesquisa" className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"><X size={14} /></button>}
                            </div>
                        )}
                        {isAdmin && draft === null && (
                            <button onClick={startEdit} className={`${BTN} shrink-0 bg-slate-100 hover:bg-slate-200 text-slate-700`}><Pencil size={14} />Editar</button>
                        )}
                    </div>
                </div>

                {draft !== null && preview ? (
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={() => save.mutate(draft)} disabled={busy || !draft.trim()} className={`${BTN} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                                {save.isPending && <Loader2 size={14} className="animate-spin" />}Guardar
                            </button>
                            <button onClick={() => { setDraft(null); setError(''); }} disabled={busy} className={`${BTN} bg-slate-100 hover:bg-slate-200 text-slate-600`}>Cancelar</button>
                            {isEdited && <button onClick={restore} disabled={busy} className={`${BTN} ml-auto bg-slate-100 hover:bg-slate-200 text-rose-600`}>Repor original</button>}
                        </div>
                        {error && <p className="text-sm text-rose-600">{error}</p>}
                        <p className="text-xs text-text-muted">
                            Escreve em markdown: <code># Título</code> (do guia, opcional), <code>## 1. Secção</code>, <code>### Subtítulo</code>, listas com <code>- </code> ou <code>1. </code>, <code>**negrito**</code>, <code>*«frase para o assistente»*</code> (aparece como balão), <code>&gt; aviso</code>, <code>[texto](doc:assistente)</code> para ligar a outro guia (editor, comofazer, assistente). Acrescenta <code>{'{admin}'}</code> ao título de uma secção para só os administradores a verem.
                        </p>
                        <div className="grid gap-4 lg:grid-cols-2 items-start">
                            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-label="Texto do guia (markdown)"
                                className="h-[75vh] w-full resize-y rounded-xl border border-border bg-white p-4 font-mono text-[13px] leading-relaxed outline-none focus:border-slate-400" />
                            <div className="h-[75vh] overflow-y-auto rounded-xl border border-border bg-bg-color p-4 flex">
                                <GuideBody doc={preview} isAdmin onDoc={() => undefined} />
                            </div>
                        </div>
                    </div>
                ) : q ? (
                    <div className="flex flex-col gap-4">
                        <p className="text-sm text-text-muted">{hits.length === 0 ? 'Nenhuma secção encontrada.' : `${hits.length} ${hits.length === 1 ? 'secção encontrada' : 'secções encontradas'}`}</p>
                        {hits.map(({ s, label }) => <SectionView key={s.id} s={s} badge={label} onDoc={switchTo} />)}
                    </div>
                ) : (
                    <div className="flex gap-8 items-start">
                        <nav aria-label="Índice" className="hidden lg:flex sticky top-6 w-60 shrink-0 flex-col gap-0.5 max-h-[calc(100vh-3rem)] overflow-y-auto">
                            {guide.doc.sections.filter(visible).map((s) => (
                                <button key={s.id} onClick={() => go(s.id)} className="text-left rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-slate-100 hover:text-text-main transition-colors">{s.title}</button>
                            ))}
                        </nav>
                        <GuideBody doc={guide.doc} isAdmin={isAdmin} onDoc={switchTo} />
                    </div>
                )}
            </div>
        </div>
    );
};
