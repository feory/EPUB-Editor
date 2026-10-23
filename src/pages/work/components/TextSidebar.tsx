import React, { useState } from 'react';
import { X, RotateCcw, Plus, Bold, Italic, Underline, Strikethrough, Superscript, Subscript } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { Row, Select, Section, Color, LenInput } from './BlockSidebar';
import { FONT_FAMILIES, INLINE_FORMATS, EMPTY_SELECTION, selectionToCss, type SelectionProps, type SelectionInfo } from '../editor/selectionProps';
import { listCharStyles } from '../../../utils/book-css';
import { charStyleClassOf, charStyleLabel } from '../../../utils/char-styles';
import type { BlockInfo, BlockEdit } from '../editor/blockEditing';

interface TextSidebarProps {
    info: BlockInfo;                                  // só interessa o texto selecionado
    css: string;                                      // CSS atual do livro (estilos de caracteres existentes)
    onEdit: (edit: BlockEdit) => void;
    onCreateStyle: (cls: string, body: string) => string | null; // devolve o erro, ou null se criou
    onClose: () => void;
    width: number;
    onResize: (width: number) => void;
}

const ICONS: Record<string, React.ReactNode> = {
    bold: <Bold size={15} />, italic: <Italic size={15} />, underline: <Underline size={15} />, strikethrough: <Strikethrough size={15} />,
    superscript: <Superscript size={15} />, subscript: <Subscript size={15} />,
    'small-caps': <span className="text-[11px] font-semibold">Sc</span>, 'small-text': <span className="text-[10px] font-semibold">a</span>, uppercase: <span className="text-[11px] font-semibold">AA</span>,
};

// Painel "Editor de Texto": só os caracteres selecionados — formato (negrito, itálico…), cor, fundo, tamanho, espaço entre
// letras e tipo de letra. Cada campo escreve/tira UM formato inline; o parágrafo é do Mini-menu e do painel do bloco.
// Estilos de caracteres: classes `.c-nome` na secção de estilos do livro; aplicam-se à seleção como <span class>. Criar um
// estilo guarda o que a seleção tem agora (formatos + aspeto) e aplica-o à seleção.
const CharStyles: React.FC<{ selection: SelectionInfo; css: string; onEdit: (edit: BlockEdit) => void; onCreate: (cls: string, body: string) => string | null }> = ({ selection, css, onEdit, onCreate }) => {
    const [name, setName] = useState<string | null>(null);
    const [error, setError] = useState('');
    const create = () => {
        const cls = charStyleClassOf(name ?? '');
        if (!cls) return setError('Dá um nome ao estilo.');
        const body = selectionToCss(selection);
        if (!body) return setError('A seleção não tem formato nem aspeto para guardar.');
        const err = onCreate(cls, body);
        if (err) return setError(err);
        onEdit({ target: 'inlineFormat', format: cls }); // aplica já à seleção
        setName(null); setError('');
    };
    return (
        <Section>
            <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Estilos de caracteres</h4>
                {name === null && (
                    <button type="button" onClick={() => setName('')} title="Novo estilo" aria-label="Novo estilo"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"><Plus size={16} /></button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                {listCharStyles(css).map((cls) => {
                    const on = selection.formats.includes(cls);
                    return (
                        <button key={cls} type="button" aria-pressed={on} onClick={() => onEdit({ target: 'inlineFormat', format: cls })}
                            className={`h-8 px-3 rounded-full border text-xs transition-colors ${on ? 'bg-slate-700 border-slate-700 text-white' : 'border-border text-text-main hover:bg-slate-50'}`}>
                            {charStyleLabel(cls)}
                        </button>
                    );
                })}
                {listCharStyles(css).length === 0 && name === null && <span className="text-xs text-text-muted">Ainda não há estilos.</span>}
            </div>
            {name !== null && (
                <div className="flex flex-col gap-2">
                    <input autoFocus placeholder="Nome (ex.: Destaque)" value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { setName(null); setError(''); } }}
                        className="h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary" />
                    <p className="text-xs text-text-muted">Guarda o formato e o aspeto da seleção atual como estilo.</p>
                    {error && <div className="text-xs text-rose-600">{error}</div>}
                    <div className="flex gap-2">
                        <button type="button" onClick={create} className="h-8 px-3 rounded-lg bg-slate-700 text-white text-xs hover:bg-slate-800">Criar estilo</button>
                        <button type="button" onClick={() => { setName(null); setError(''); }} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-slate-50">Cancelar</button>
                    </div>
                </div>
            )}
        </Section>
    );
};

export const TextSidebar: React.FC<TextSidebarProps> = ({ info, css, onEdit, onCreateStyle, onClose, width, onResize }) => {
    const { selection } = info;
    const set = (patch: Partial<SelectionProps>) => onEdit({ target: 'selection', patch });
    return (
        <aside style={{ width }} className="fixed right-4 top-[calc(var(--wp-header-h,57px)_+_32px)] bottom-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">
            <PanelResizeHandle width={width} onResize={onResize} />
            <div className="px-6 py-4 min-h-[64px] border-b border-border bg-slate-50/50 flex items-center justify-between whitespace-nowrap">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Editor de Texto</h3>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all"><X size={16} /></button>
            </div>
            {!selection ? (
                <div className="flex-1 flex items-center justify-center px-10 text-center text-sm text-text-muted">
                    Seleciona texto num parágrafo ou título para editar o formato, a cor, o fundo, o tamanho e o espaço entre letras.
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-8">
                    <CharStyles selection={selection} css={css} onEdit={onEdit} onCreate={onCreateStyle} />
                    <Section title="Formato">
                        <div className="grid grid-cols-3 gap-2">
                            {INLINE_FORMATS.map(([format, label]) => {
                                const on = selection.formats.includes(format);
                                return (
                                    <button key={format} type="button" title={label} aria-pressed={on} onClick={() => onEdit({ target: 'inlineFormat', format })}
                                        className={`h-9 rounded-lg border text-xs flex items-center justify-center gap-1.5 transition-colors ${on ? 'bg-slate-700 border-slate-700 text-white' : 'border-border text-text-main hover:bg-slate-50'}`}>
                                        {ICONS[format]}<span className="truncate">{label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </Section>
                    <Section title="Aspeto">
                        <Row label="Cor do texto"><Color value={selection.color} fallback="#000000" onChange={(v) => set({ color: v })} /></Row>
                        <Row label="Cor de fundo"><Color value={selection.background} fallback="#ffe066" onChange={(v) => set({ background: v })} /></Row>
                        <Row label="Tamanho"><LenInput value={selection.fontSize} minEm={0.5} maxEm={4} stepEm={0.05} onChange={(v) => set({ fontSize: v })} /></Row>
                        <Row label="Espaço entre letras"><LenInput value={selection.letterSpacing} minEm={-0.2} maxEm={1} stepEm={0.01} onChange={(v) => set({ letterSpacing: v })} /></Row>
                        <Row label="Tipo de letra"><Select value={selection.fontFamily} options={FONT_FAMILIES} onChange={(v) => set({ fontFamily: v })} /></Row>
                        <button type="button" onClick={() => set(EMPTY_SELECTION)}
                            className="self-start flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main"><RotateCcw size={12} /> Repor</button>
                    </Section>
                </div>
            )}
        </aside>
    );
};
