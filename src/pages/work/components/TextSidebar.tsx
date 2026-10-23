import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { Row, Select, Section, Color, LenInput } from './BlockSidebar';
import { FONT_FAMILIES, EMPTY_SELECTION } from '../editor/selectionProps';
import { BLOCK_STYLE_OPTIONS } from '../editor/config';
import type { TextAlign } from '../editor/textProps';
import type { BlockInfo, BlockEdit } from '../editor/blockEditing';

interface TextSidebarProps {
    info: BlockInfo;                                  // bloco de texto sob o cursor + texto selecionado
    onEdit: (edit: BlockEdit) => void;
    onClose: () => void;
    width: number;
    onResize: (width: number) => void;
}

const ALIGNS: ReadonlyArray<readonly [TextAlign, string]> = [['', 'Padrão'], ['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita'], ['justify', 'Justificado']];

// Os botões de estilo do Mini-menu de parágrafo (combináveis): ligam/desligam uma classe do bloco.
const TOGGLES: ReadonlyArray<readonly [string, string]> = [
    ['p-indent', 'Com indentação'], ['p-top', 'Espaçamento no topo'], ['p-quote', 'Citação'], ['p-uppercase', 'Maiúsculas'],
];

// Estilo atual do bloco: Título 1-3, ou o 1.º estilo exclusivo presente nas classes, ou Padrão.
const currentStyle = (tag: string, classes: string[]): string => {
    if (/^h[1-3]$/.test(tag)) return tag;
    const exclusive = BLOCK_STYLE_OPTIONS.map(([f]) => f).find((f) => f !== 'p' && !/^h[1-3]$/.test(f) && !TOGGLES.some(([c]) => c === f) && classes.includes(f));
    return exclusive ?? 'p';
};

// Painel "Editar texto": tudo o que o Mini-menu oferece (estilo, alinhamento, indentação, topo, citação, maiúsculas) mais
// os caracteres selecionados (cor, fundo, tamanho, espaço entre letras, tipo de letra). Com ele aberto o Mini-menu esconde-se.
export const TextSidebar: React.FC<TextSidebarProps> = ({ info, onEdit, onClose, width, onResize }) => {
    const { text, selection } = info;
    const isHeading = !!text && /^h[1-6]$/.test(text.tag);
    return (
        <aside style={{ width }} className="fixed right-4 top-[calc(var(--wp-header-h,57px)_+_32px)] bottom-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">
            <PanelResizeHandle width={width} onResize={onResize} />
            <div className="px-6 py-4 min-h-[64px] border-b border-border bg-slate-50/50 flex items-center justify-between whitespace-nowrap">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Editar texto</h3>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all"><X size={16} /></button>
            </div>
            {!text ? (
                <div className="flex-1 flex items-center justify-center px-10 text-center text-sm text-text-muted">
                    Põe o cursor num parágrafo ou título para editar o seu estilo, e seleciona texto para editar a cor, o fundo, o tamanho e o espaço entre letras.
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-8">
                    <Section title="Parágrafo">
                        <Row label="Estilo">
                            <Select value={currentStyle(text.tag, text.classes)} options={BLOCK_STYLE_OPTIONS} onChange={(format) => onEdit({ target: 'style', format })} />
                        </Row>
                        <Row label="Alinhamento">
                            <Select value={text.inline.align} options={ALIGNS} onChange={(align) => onEdit({ target: 'text', patch: { align } })} />
                        </Row>
                        {!isHeading && TOGGLES.map(([cls, label]) => (
                            <label key={cls} className="flex items-center justify-between gap-3 text-sm font-medium text-text-main cursor-pointer">
                                <span>{label}</span>
                                <input type="checkbox" checked={text.classes.includes(cls)} onChange={(e) => onEdit({ target: 'class', cls, on: e.target.checked })} className="w-4 h-4 accent-slate-700" />
                            </label>
                        ))}
                    </Section>
                    {selection ? (
                        <Section title="Texto selecionado">
                            <Row label="Cor do texto"><Color value={selection.color} fallback="#000000" onChange={(v) => onEdit({ target: 'selection', patch: { color: v } })} /></Row>
                            <Row label="Cor de fundo"><Color value={selection.background} fallback="#ffe066" onChange={(v) => onEdit({ target: 'selection', patch: { background: v } })} /></Row>
                            <Row label="Tamanho"><LenInput value={selection.fontSize} minEm={0.5} maxEm={4} stepEm={0.05} onChange={(v) => onEdit({ target: 'selection', patch: { fontSize: v } })} /></Row>
                            <Row label="Espaço entre letras"><LenInput value={selection.letterSpacing} minEm={-0.2} maxEm={1} stepEm={0.01} onChange={(v) => onEdit({ target: 'selection', patch: { letterSpacing: v } })} /></Row>
                            <Row label="Tipo de letra"><Select value={selection.fontFamily} options={FONT_FAMILIES} onChange={(v) => onEdit({ target: 'selection', patch: { fontFamily: v } })} /></Row>
                            <button type="button" onClick={() => onEdit({ target: 'selection', patch: EMPTY_SELECTION })}
                                className="self-start flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main"><RotateCcw size={12} /> Repor texto selecionado</button>
                        </Section>
                    ) : (
                        <p className="text-xs text-text-muted">Seleciona texto para mudar a cor, o fundo, o tamanho e o espaço entre letras.</p>
                    )}
                </div>
            )}
        </aside>
    );
};
