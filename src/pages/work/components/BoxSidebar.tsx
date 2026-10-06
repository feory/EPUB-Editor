import React, { useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { BOX_VARIANTS, type BoxProps, type BoxBorderStyle } from '../editor/boxProps';

interface BoxSidebarProps {
    box: BoxProps | null; // caixa sob o cursor; null = cursor fora de caixas
    onChange: (patch: Partial<BoxProps>) => void;
    onClose: () => void;
    width: number;
    onResize: (width: number) => void;
}

// Sem valores próprios: a caixa volta ao que o CSS do livro define para .box.
const RESET: BoxProps = { variant: '', background: '', color: '', borderColor: '', borderWidth: null, borderStyle: '', radius: null, padding: null, marginY: null, width: null };

const BORDER_STYLES: Array<[BoxBorderStyle, string]> = [['', 'Padrão'], ['solid', 'Sólido'], ['dashed', 'Tracejado'], ['dotted', 'Pontilhado']];

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <label className="flex items-center justify-between gap-3 text-sm font-medium text-text-main">
        <span>{label}</span>
        <span className="flex items-center gap-2">{children}</span>
    </label>
);

const Color: React.FC<{ value: string; fallback: string; onChange: (v: string) => void }> = ({ value, fallback, onChange }) => (
    <>
        <span className="w-28 flex justify-center">
            <input type="color" value={value || fallback} onChange={e => onChange(e.target.value)}
                className="w-9 h-9 rounded-lg cursor-pointer border border-border p-0.5" />
        </span>
        <button type="button" onClick={() => onChange('')} disabled={!value} title="Remover (herdar do livro)"
            className="w-6 flex justify-center text-text-muted hover:text-text-main disabled:invisible"><X size={14} /></button>
    </>
);

// Texto livre enquanto se escreve (limitar a cada tecla impedia números como 80 com min=30);
// só aplica valores já dentro do intervalo e limita ao sair do campo.
const Num: React.FC<{ value: number | null; unit: string; min: number; max: number; step?: number; onChange: (v: number | null) => void }> = ({ value, unit, min, max, step = 1, onChange }) => {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <>
            <input type="number" min={min} max={max} step={step} value={draft ?? value ?? ''} placeholder="—"
                onChange={e => {
                    setDraft(e.target.value);
                    if (e.target.value === '') return onChange(null);
                    const n = Number(e.target.value);
                    if (n >= min && n <= max) onChange(n);
                }}
                onBlur={() => {
                    if (draft !== null && draft !== '') onChange(Math.min(max, Math.max(min, Number(draft))));
                    setDraft(null);
                }}
                className="w-28 h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary" />
            <span className="w-6 text-xs text-text-muted">{unit}</span>
        </>
    );
};

export const BoxSidebar: React.FC<BoxSidebarProps> = ({ box, onChange, onClose, width, onResize }) => (
    <aside style={{ width }} className="fixed right-4 top-[calc(var(--wp-header-h,57px)_+_32px)] bottom-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">
        <PanelResizeHandle width={width} onResize={onResize} />
        <div className="px-6 py-4 min-h-[64px] border-b border-border bg-slate-50/50 flex items-center justify-between whitespace-nowrap">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Edição da Caixa</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all"><X size={16} /></button>
        </div>
        {!box ? (
            <div className="flex-1 flex items-center justify-center px-10 text-center text-sm text-text-muted">
                Põe o cursor dentro de uma caixa para editar os seus atributos.
            </div>
        ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-4">
                <Row label="Tipo">
                    <select value={box.variant} onChange={e => onChange({ variant: e.target.value as BoxProps['variant'] })}
                        className="w-28 h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary">
                        {BOX_VARIANTS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
                    </select>
                    <span className="w-6" />
                </Row>
                <Row label="Cor de fundo"><Color value={box.background} fallback="#ffffff" onChange={background => onChange({ background })} /></Row>
                <Row label="Cor do texto"><Color value={box.color} fallback="#000000" onChange={color => onChange({ color })} /></Row>
                <Row label="Cor do contorno"><Color value={box.borderColor} fallback="#000000" onChange={borderColor => onChange({ borderColor })} /></Row>
                <Row label="Espessura do contorno"><Num value={box.borderWidth} unit="px" min={0} max={10} onChange={borderWidth => onChange({ borderWidth })} /></Row>
                <Row label="Estilo do contorno">
                    <select value={box.borderStyle} onChange={e => onChange({ borderStyle: e.target.value as BoxBorderStyle })}
                        className="w-28 h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary">
                        {BORDER_STYLES.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
                    </select>
                    <span className="w-6" />
                </Row>
                <Row label="Cantos arredondados"><Num value={box.radius} unit="px" min={0} max={40} onChange={radius => onChange({ radius })} /></Row>
                <Row label="Espaço interior"><Num value={box.padding} unit="em" min={0} max={5} step={0.1} onChange={padding => onChange({ padding })} /></Row>
                <Row label="Margem cima/baixo"><Num value={box.marginY} unit="em" min={0} max={5} step={0.1} onChange={marginY => onChange({ marginY })} /></Row>
                <Row label="Largura"><Num value={box.width} unit="%" min={30} max={100} onChange={width => onChange({ width })} /></Row>
                <p className="text-xs text-text-muted">Campos vazios herdam do estilo do livro.</p>
                <button type="button" onClick={() => onChange(RESET)}
                    className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-slate-50 transition-colors">
                    <RotateCcw size={16} />
                    <span>Repor</span>
                </button>
            </div>
        )}
    </aside>
);
