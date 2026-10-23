import React from 'react';
import { X, RotateCcw } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { Row, Select, Section, Color, LenInput } from './BlockSidebar';
import { FONT_FAMILIES, EMPTY_SELECTION, type SelectionProps } from '../editor/selectionProps';

interface TextSidebarProps {
    selection: SelectionProps | null;                 // null = nada selecionado
    onChange: (patch: Partial<SelectionProps>) => void;
    onClose: () => void;
    width: number;
    onResize: (width: number) => void;
}

// Painel "Editar texto": só os caracteres selecionados. Cada campo escreve/tira UM span inline (cor, fundo, tamanho,
// espaço entre letras, família); o bloco, a caixa e os estilos do livro têm o painel "Edição do Bloco".
export const TextSidebar: React.FC<TextSidebarProps> = ({ selection, onChange, onClose, width, onResize }) => (
    <aside style={{ width }} className="fixed right-4 top-[calc(var(--wp-header-h,57px)_+_32px)] bottom-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">
        <PanelResizeHandle width={width} onResize={onResize} />
        <div className="px-6 py-4 min-h-[64px] border-b border-border bg-slate-50/50 flex items-center justify-between whitespace-nowrap">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Editar texto</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all"><X size={16} /></button>
        </div>
        {!selection ? (
            <div className="flex-1 flex items-center justify-center px-10 text-center text-sm text-text-muted">
                Seleciona texto num parágrafo ou título para editar a cor, o fundo, o tamanho e o espaço entre letras.
            </div>
        ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-8">
                <Section>
                    <Row label="Cor do texto"><Color value={selection.color} fallback="#000000" onChange={(v) => onChange({ color: v })} /></Row>
                    <Row label="Cor de fundo"><Color value={selection.background} fallback="#ffe066" onChange={(v) => onChange({ background: v })} /></Row>
                    <Row label="Tamanho"><LenInput value={selection.fontSize} minEm={0.5} maxEm={4} stepEm={0.05} onChange={(v) => onChange({ fontSize: v })} /></Row>
                    <Row label="Espaço entre letras"><LenInput value={selection.letterSpacing} minEm={-0.2} maxEm={1} stepEm={0.01} onChange={(v) => onChange({ letterSpacing: v })} /></Row>
                    <Row label="Tipo de letra"><Select value={selection.fontFamily} options={FONT_FAMILIES} onChange={(v) => onChange({ fontFamily: v })} /></Row>
                    <button type="button" onClick={() => onChange(EMPTY_SELECTION)}
                        className="self-start flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main"><RotateCcw size={12} /> Repor texto selecionado</button>
                </Section>
            </div>
        )}
    </aside>
);
