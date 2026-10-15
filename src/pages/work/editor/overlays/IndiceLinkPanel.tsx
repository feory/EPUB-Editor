import { useEffect, useMemo, useRef, useState } from 'react';
import type { TinyMCEEditor } from '../types';
import { chapterOfTarget } from '../../../../utils/indice-marker';

export interface IndiceLinkSubtitle { chapterIndex: number; index: number; text: string; anchor?: true; id?: string }
export interface IndiceLinkChapter { title: string; level: string }

interface Props {
    top: number;
    left: number;
    editor: TinyMCEEditor | null;
    chapters: IndiceLinkChapter[];
    subtitles: IndiceLinkSubtitle[];
    ownIndex: number;           // capítulo Índice (não é destino)
    currentTarget: string;       // data-target atual da entrada ('' = sem ligação → sem "Remover ligação")
    onPick: (chapterIndex: number | null, subIndex?: number) => void; // null = remover ligação
    onClose: () => void;
}

// sem acentos/maiúsculas — "introducao" acha "Introdução"
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "Ligar a…" do Índice: capítulos recolhidos, clicar na seta expande os subtítulos; pesquisa filtra e expande. */
export function IndiceLinkPanel({ top, left, editor, chapters, subtitles, ownIndex, currentTarget, onPick, onClose }: Props) {
    const [query, setQuery] = useState('');
    const currentChapterIndex = chapterOfTarget(currentTarget);
    const [open, setOpen] = useState<Set<number>>(() => new Set(currentChapterIndex >= 0 ? [currentChapterIndex] : subtitles.filter((t) => t.id === currentTarget).map((t) => t.chapterIndex)));
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const inside = (e: Event) => !!rootRef.current?.contains(e.target as Node);
        const onDown = (e: MouseEvent) => { if (!inside(e)) onClose(); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const onScroll = (e: Event) => { if (!inside(e)) onClose(); }; // o scroll da própria lista não fecha
        const win = editor?.getWin();
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onScroll, true);
        win?.addEventListener('scroll', onClose);
        window.addEventListener('resize', onClose);
        // Cliques/teclas DENTRO do iframe do editor não chegam ao document da app — sem isto o
        // painel ficava aberto ao clicar noutro parágrafo (e a ligar o parágrafo antigo, já guardado por pIndex).
        editor?.on('mousedown keydown', onClose);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
            win?.removeEventListener('scroll', onClose);
            window.removeEventListener('resize', onClose);
            editor?.off('mousedown keydown', onClose);
        };
    }, [editor, onClose]);

    const rows = useMemo(() => {
        const q = fold(query.trim());
        return chapters
            .map((c, i) => ({ c, i, subs: subtitles.filter((t) => t.chapterIndex === i) }))
            .filter(({ c, i }) => i !== ownIndex && c.level !== 'break')
            .map(({ c, i, subs }) => {
                if (!q) return { c, i, subs, show: true };
                const titleHit = fold(c.title).includes(q);
                const subHits = subs.filter((t) => fold(t.text).includes(q));
                return { c, i, subs: subHits, show: titleHit || subHits.length > 0 };
            })
            .filter((r) => r.show);
    }, [chapters, subtitles, ownIndex, query]);

    const toggle = (i: number) => setOpen((prev) => {
        const next = new Set(prev);
        if (!next.delete(i)) next.add(i);
        return next;
    });

    return (
        <div
            ref={rootRef}
            style={{ position: 'fixed', top, left, zIndex: 1401 }}
            className="w-80 rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 text-sm text-slate-700"
        >
            <div className="p-2 border-b border-slate-100">
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Pesquisar capítulo ou subtítulo…"
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-slate-400"
                />
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
                {currentTarget && (
                    <button type="button" onClick={() => onPick(null)} className="block w-full text-left px-2 py-1.5 mb-1 rounded-lg text-red-600 hover:bg-red-50">
                        Remover ligação
                    </button>
                )}
                {rows.length === 0 && <div className="px-2 py-3 text-slate-400">Sem resultados.</div>}
                {rows.map(({ c, i, subs }) => {
                    const expanded = !!query.trim() || open.has(i); // pesquisa expande os capítulos com resultados
                    return (
                        <div key={i}>
                            <div className="flex items-center rounded-lg hover:bg-slate-100" style={{ paddingLeft: c.level === 'h3' ? 16 : c.level === 'h2' ? 8 : 0 }}>
                                {subtitles.some((t) => t.chapterIndex === i) ? (
                                    <button
                                        type="button"
                                        aria-label={expanded ? 'Recolher subtítulos' : 'Expandir subtítulos'}
                                        onClick={() => toggle(i)}
                                        className="w-6 h-7 shrink-0 text-slate-400 hover:text-slate-700"
                                    >{expanded ? '▾' : '▸'}</button>
                                ) : <span className="w-6 shrink-0" />}
                                <button type="button" onClick={() => onPick(i)} className="flex-1 min-w-0 text-left truncate py-1.5 pr-2">
                                    {c.title}{i === currentChapterIndex && ' ✓'}
                                </button>
                            </div>
                            {expanded && subs.map((t) => (
                                <button
                                    key={t.index}
                                    type="button"
                                    onClick={() => onPick(i, t.index)}
                                    className="block w-full text-left truncate pl-9 pr-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                                >{t.anchor && '⚓ '}{t.text}{t.id && t.id === currentTarget && ' ✓'}</button>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
