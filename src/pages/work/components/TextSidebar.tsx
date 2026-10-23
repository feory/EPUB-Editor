import React from 'react';
import { X, RotateCcw, Bold, Italic, Underline, Strikethrough, Superscript, Subscript } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { Row, Select, Section, Color, LenInput } from './BlockSidebar';
import { FONT_FAMILIES, INLINE_FORMATS, EMPTY_SELECTION, type SelectionProps } from '../editor/selectionProps';
import type { BlockInfo, BlockEdit } from '../editor/blockEditing';

interface TextSidebarProps {
    info: BlockInfo;                                  // só interessa o texto selecionado
    onEdit: (edit: BlockEdit) => void;
    onClose: () => void;
    width: number;
    onResize: (width: number) => void;
}

const ICONS: Record<string, React.ReactNode> = {
    bold: <Bold size={15} />, italic: <Italic size={15} />, underline: <Underline size={15} />, strikethrough: <Strikethrough size={15} />,
    superscript: <Superscript size={15} />, subscript: <Subscript size={15} />,
    'small-caps': <span className="text-[11px] font-semibold">Sc</span>, 'small-text': <span className="text-[10px] font-semibold">a</span>, uppercase: <span className="text-[11px] font-semibold">AA</span>,
};

// Painel "Editar texto": só os caracteres selecionados — formato (negrito, itálico…), cor, fundo, tamanho, espaço entre
// letras e tipo de letra. Cada campo escreve/tira UM formato inline; o parágrafo é do Mini-menu e do painel do bloco.
export const TextSidebar: React.FC<TextSidebarProps> = ({ info, onEdit, onClose, width, onResize }) => {
    const { selection } = info;
    const set = (patch: Partial<SelectionProps>) => onEdit({ target: 'selection', patch });
    return (
        <aside style={{ width }} className="fixed right-4 top-[calc(var(--wp-header-h,57px)_+_32px)] bottom-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">
            <PanelResizeHandle width={width} onResize={onResize} />
            <div className="px-6 py-4 min-h-[64px] border-b border-border bg-slate-50/50 flex items-center justify-between whitespace-nowrap">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Editar texto</h3>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all"><X size={16} /></button>
            </div>
            {!selection ? (
                <div className="flex-1 flex items-center justify-center px-10 text-center text-sm text-text-muted">
                    Seleciona texto num parágrafo ou título para editar o formato, a cor, o fundo, o tamanho e o espaço entre letras.
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-8">
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
                            className="self-start flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main"><RotateCcw size={12} /> Repor cor, fundo, tamanho, letras e tipo</button>
                    </Section>
                </div>
            )}
        </aside>
    );
};
