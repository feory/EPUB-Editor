import React, { useState, useEffect, useRef } from 'react';
import { X, MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react';
import { convertLen, type Len, type Unit } from '../editor/textProps';

// Campos de formulário dos painéis laterais (Edição do Bloco, Editor de Texto): linha rotulada, secção, seletor, cor,
// número e medida px/em. Cada painel só importa o que usa; nenhum depende do ficheiro do outro.

export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <label className="flex items-center justify-between gap-3 text-sm font-medium text-text-main">
        <span>{label}</span>
        <span className="w-44 flex items-center gap-2">{children}</span>
    </label>
);

const SELECT_CLS = 'select-chevron flex-1 min-w-0 h-9 rounded-lg border border-border pl-2 pr-8 text-sm outline-none focus:border-primary';

export const Select = <T extends string>({ value, options, onChange }: { value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void }) => (
    <>
        <select value={value} onChange={e => onChange(e.target.value as T)} className={SELECT_CLS}>
            {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
    </>
);

export const Section: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="flex flex-col gap-4">
        {title && <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{title}</h4>}
        {children}
    </section>
);

export const Color: React.FC<{ value: string; fallback: string; onChange: (v: string) => void }> = ({ value, fallback, onChange }) => (
    <>
        <span className="flex-1 flex justify-start">
            <input type="color" value={value || fallback} onChange={e => onChange(e.target.value)}
                className="w-9 h-9 rounded-lg cursor-pointer border border-border p-0.5" />
        </span>
        <button type="button" onClick={() => onChange('')} disabled={!value} title="Remover (herdar do livro)"
            className="w-14 flex justify-center text-text-muted hover:text-text-main disabled:invisible"><X size={14} /></button>
    </>
);

// Texto livre enquanto se escreve (limitar a cada tecla impedia números como 80 com min=30);
// só aplica valores já dentro do intervalo e limita ao sair do campo.
export const Num: React.FC<{ value: number | null; unit: string; min: number; max: number; step?: number; placeholder?: number | null; suffix?: React.ReactNode; onChange: (v: number | null) => void }> = ({ value, unit, min, max, step = 1, placeholder, suffix, onChange }) => {
    const [draft, setDraft] = useState<string | null>(null);
    return (
        <>
            <input type="number" min={min} max={max} step={step} value={draft ?? value ?? ''} placeholder={placeholder != null ? String(placeholder) : '—'}
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
                className="flex-1 min-w-0 h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary" />
            {suffix ?? <span className="w-14 text-xs text-text-muted">{unit}</span>}
        </>
    );
};

// Medida com seletor px/em: mostra e guarda na unidade que o CSS já usa; trocar a unidade converte (16px = 1em).
// Limites dados em em (em px ×16).
export const LenInput: React.FC<{ value: Len | null; placeholder?: Len | null; minEm: number; maxEm: number; stepEm: number; onChange: (v: Len | null) => void }> = ({ value, placeholder, minEm, maxEm, stepEm, onChange }) => {
    const [picked, setPicked] = useState<Unit | null>(null); // unidade escolhida enquanto o campo está vazio
    const unit: Unit = value?.u ?? picked ?? placeholder?.u ?? 'em';
    const k = unit === 'px' ? 16 : 1;
    return (
        <Num value={value?.n ?? null} placeholder={placeholder ? convertLen(placeholder, unit).n : null} unit={unit}
            min={minEm * k} max={maxEm * k} step={unit === 'px' ? 1 : stepEm}
            suffix={
                <select value={unit} aria-label="Unidade" onChange={(e) => { const u = e.target.value as Unit; if (value) onChange(convertLen(value, u)); else setPicked(u); }}
                    className="select-chevron w-14 h-9 rounded-lg border border-border pl-1.5 pr-6 text-xs text-text-muted outline-none cursor-pointer">
                    <option value="em">em</option><option value="px">px</option>
                </select>
            }
            onChange={(n) => onChange(n === null ? null : { n, u: unit })} />
    );
};

// Menu "⋯" de um estilo: clonar, editar, apagar. Fecha com clique fora ou Esc.
export const StyleMenu: React.FC<{ label: string; onClone: () => void; onEdit: () => void; onDelete: () => void; light: boolean }> = ({ label, onClone, onEdit, onDelete, light }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', away);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
    }, [open]);
    const item = (text: string, icon: React.ReactNode, run: () => void, danger = false) => (
        <button type="button" role="menuitem" onClick={() => { setOpen(false); run(); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-slate-50 ${danger ? 'text-rose-600' : 'text-text-main'}`}>{icon}{text}</button>
    );
    return (
        <span ref={ref} className="h-full flex">
            <button type="button" title="Mais opções" aria-label={`Mais opções de ${label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
                className={`h-full pr-2.5 pl-0.5 rounded-r-full ${light ? 'opacity-80' : 'opacity-50'} hover:opacity-100`}><MoreHorizontal size={14} /></button>
            {open && (
                <div role="menu" className="absolute left-0 top-9 z-20 w-36 rounded-lg border border-border bg-white shadow-md py-1 text-text-main">
                    {item('Clonar', <Copy size={12} />, onClone)}
                    {item('Editar', <Pencil size={12} />, onEdit)}
                    {item('Apagar', <Trash2 size={12} />, onDelete, true)}
                </div>
            )}
        </span>
    );
};
