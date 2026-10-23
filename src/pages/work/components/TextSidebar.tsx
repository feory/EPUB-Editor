import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, Plus, MoreHorizontal, Pencil, Copy, Trash2, Bold, Italic, Underline, Strikethrough, Superscript, Subscript } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { Row, Select, Section, Color, LenInput } from './panelFields';
import { FONT_FAMILIES, INLINE_FORMATS, EMPTY_SELECTION, selectionToCss, cssToSelection, type SelectionProps, type SelectionInfo } from '../editor/selectionProps';
import { listCharStyles, readCustomStyle } from '../../../utils/book-css';
import { charStyleClassOf, charStyleLabel, cloneCharStyleClass } from '../../../utils/char-styles';
import type { BlockInfo, BlockEdit } from '../editor/blockEditing';

interface TextSidebarProps {
    info: BlockInfo;                                  // só interessa o texto selecionado
    css: string;                                      // CSS atual do livro (estilos de caracteres existentes)
    onEdit: (edit: BlockEdit) => void;
    onCreateStyle: (cls: string, body: string) => string | null; // devolve o erro, ou null se criou
    onUpdateStyle: (cls: string, body: string) => string | null; // idem, ao editar um estilo
    onDeleteStyle: (cls: string) => void;                        // apaga a regra e retira o estilo do texto
    onClose: () => void;
    width: number;
    onResize: (width: number) => void;
}

const ICONS: Record<string, React.ReactNode> = {
    bold: <Bold size={15} />, italic: <Italic size={15} />, underline: <Underline size={15} />, strikethrough: <Strikethrough size={15} />,
    superscript: <Superscript size={15} />, subscript: <Subscript size={15} />,
    'small-caps': <span className="text-[11px] font-semibold">Sc</span>, 'small-text': <span className="text-[10px] font-semibold">a</span>, uppercase: <span className="text-[11px] font-semibold">AA</span>,
};

// Os controlos de formato e aspeto: servem a seleção do texto (escrevem no editor) e o editor de um estilo (escrevem num rascunho).
const FormatFields: React.FC<{ value: SelectionInfo; onToggle: (format: string) => void; onChange: (patch: Partial<SelectionProps>) => void }> = ({ value, onToggle, onChange }) => (
    <>
        <Section title="Formato">
            <div className="grid grid-cols-3 gap-2">
                {INLINE_FORMATS.map(([format, label]) => {
                    const on = value.formats.includes(format);
                    return (
                        <button key={format} type="button" title={label} aria-pressed={on} onClick={() => onToggle(format)}
                            className={`h-9 rounded-lg border text-xs flex items-center justify-center gap-1.5 transition-colors ${on ? 'bg-slate-700 border-slate-700 text-white' : 'border-border text-text-main hover:bg-slate-50'}`}>
                            {ICONS[format]}<span className="truncate">{label}</span>
                        </button>
                    );
                })}
            </div>
        </Section>
        <Section title="Aspeto">
            <Row label="Cor do texto"><Color value={value.color} fallback="#000000" onChange={(v) => onChange({ color: v })} /></Row>
            <Row label="Cor de fundo"><Color value={value.background} fallback="#ffe066" onChange={(v) => onChange({ background: v })} /></Row>
            <Row label="Tamanho"><LenInput value={value.fontSize} minEm={0.5} maxEm={4} stepEm={0.05} onChange={(v) => onChange({ fontSize: v })} /></Row>
            <Row label="Espaço entre letras"><LenInput value={value.letterSpacing} minEm={-0.2} maxEm={1} stepEm={0.01} onChange={(v) => onChange({ letterSpacing: v })} /></Row>
            <Row label="Tipo de letra"><Select value={value.fontFamily} options={FONT_FAMILIES} onChange={(v) => onChange({ fontFamily: v })} /></Row>
            <button type="button" onClick={() => onChange(EMPTY_SELECTION)}
                className="self-start flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main"><RotateCcw size={12} /> Repor</button>
        </Section>
    </>
);

// Editar um estilo de caracteres: os mesmos controlos, sobre um rascunho lido das declarações do estilo. As declarações que os
// controlos não representam (`rest`) mantêm-se ao guardar. Apagar pede confirmação.
const StyleEditor: React.FC<{
    cls: string; css: string; onSave: (body: string) => string | null; onDelete: () => void; onCancel: () => void;
}> = ({ cls, css, onSave, onDelete, onCancel }) => {
    const [{ selection: initial, rest }] = useState(() => cssToSelection(readCustomStyle(css, cls)));
    const [draft, setDraft] = useState<SelectionInfo>(initial);
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);
    const change = (patch: Partial<SelectionProps>) => { setDraft({ ...draft, ...patch }); setError(''); };
    const toggle = (format: string) => {
        setDraft({ ...draft, formats: draft.formats.includes(format) ? draft.formats.filter((f) => f !== format) : [...draft.formats, format] });
        setError('');
    };
    const save = () => {
        const body = [selectionToCss(draft), ...rest.map((d) => `${d};`)].filter(Boolean).join(' ');
        const err = onSave(body);
        if (err) setError(err);
    };
    return (
        <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-8">
            <Section title={`Estilo "${charStyleLabel(cls)}"`}>
                <p className="text-xs text-text-muted">A alteração vale em todo o livro, onde o estilo foi aplicado.</p>
                {error && <div className="text-xs text-rose-600">{error}</div>}
                {confirming ? (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs text-rose-700">Apagar o estilo e retirá-lo de todo o texto onde foi aplicado?</p>
                        <div className="flex gap-2">
                            <button type="button" onClick={onDelete} className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs hover:bg-rose-700">Apagar</button>
                            <button type="button" onClick={() => setConfirming(false)} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-slate-50">Cancelar</button>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <button type="button" onClick={save} className="h-8 px-3 rounded-lg bg-slate-700 text-white text-xs hover:bg-slate-800">Guardar</button>
                        <button type="button" onClick={onCancel} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-slate-50">Cancelar</button>
                        <button type="button" onClick={() => setConfirming(true)} title="Apagar estilo" aria-label="Apagar estilo"
                            className="ml-auto h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                    </div>
                )}
            </Section>
            <FormatFields value={draft} onToggle={toggle} onChange={change} />
        </div>
    );
};

// Menu "⋯" de um estilo: clonar, editar, apagar. Fecha com clique fora ou Esc.
const StyleMenu: React.FC<{ label: string; onClone: () => void; onEdit: () => void; onDelete: () => void; light: boolean }> = ({ label, onClone, onEdit, onDelete, light }) => {
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

// Estilos de caracteres: classes `.c-nome` na secção de estilos do livro; aplicam-se à seleção como <span class>. Criar um
// estilo guarda o que a seleção tem agora (formatos + aspeto) e aplica-o à seleção.
const CharStyles: React.FC<{
    selection: SelectionInfo; css: string; onEdit: (edit: BlockEdit) => void; onStartEdit: (cls: string) => void;
    onCreate: (cls: string, body: string) => string | null; onDelete: (cls: string) => void;
}> = ({ selection, css, onEdit, onStartEdit, onCreate, onDelete }) => {
    const [name, setName] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState<string | null>(null); // estilo à espera de confirmação para apagar
    const clone = (cls: string) => {
        const err = onCreate(cloneCharStyleClass(listCharStyles(css), cls), readCustomStyle(css, cls));
        setError(err ?? '');
    };
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
                        <span key={cls} className={`relative inline-flex items-center h-8 rounded-full border text-xs transition-colors ${on ? 'bg-slate-700 border-slate-700 text-white' : 'border-border text-text-main hover:bg-slate-50'}`}>
                            <button type="button" aria-pressed={on} onClick={() => onEdit({ target: 'inlineFormat', format: cls })} className="h-full pl-3 pr-2 rounded-l-full">{charStyleLabel(cls)}</button>
                            <StyleMenu label={charStyleLabel(cls)} light={on} onClone={() => clone(cls)} onEdit={() => onStartEdit(cls)} onDelete={() => setDeleting(cls)} />
                        </span>
                    );
                })}
                {listCharStyles(css).length === 0 && name === null && <span className="text-xs text-text-muted">Ainda não há estilos.</span>}
            </div>
            {deleting && (
                <div className="flex flex-col gap-2">
                    <p className="text-xs text-rose-700">Apagar o estilo "{charStyleLabel(deleting)}" e retirá-lo de todo o texto onde foi aplicado?</p>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => { onDelete(deleting); setDeleting(null); }} className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs hover:bg-rose-700">Apagar</button>
                        <button type="button" onClick={() => setDeleting(null)} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-slate-50">Cancelar</button>
                    </div>
                </div>
            )}
            {error && name === null && <div className="text-xs text-rose-600">{error}</div>}
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

// Painel "Editor de Texto": só os caracteres selecionados — formato (negrito, itálico…), cor, fundo, tamanho, espaço entre
// letras, tipo de letra e estilos de caracteres. O parágrafo é do Mini-menu e do painel do bloco.
export const TextSidebar: React.FC<TextSidebarProps> = ({ info, css, onEdit, onCreateStyle, onUpdateStyle, onDeleteStyle, onClose, width, onResize }) => {
    const { selection } = info;
    const [editingCls, setEditingCls] = useState<string | null>(null);
    return (
        <aside style={{ width }} className="fixed right-4 top-[calc(var(--wp-header-h,57px)_+_32px)] bottom-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">
            <PanelResizeHandle width={width} onResize={onResize} />
            <div className="px-6 py-4 min-h-[64px] border-b border-border bg-slate-50/50 flex items-center justify-between whitespace-nowrap">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Editor de Texto</h3>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all"><X size={16} /></button>
            </div>
            {editingCls ? (
                <StyleEditor key={editingCls} cls={editingCls} css={css}
                    onSave={(body) => { const err = onUpdateStyle(editingCls, body); if (!err) setEditingCls(null); return err; }}
                    onDelete={() => { onDeleteStyle(editingCls); setEditingCls(null); }}
                    onCancel={() => setEditingCls(null)} />
            ) : !selection ? (
                <div className="flex-1 flex items-center justify-center px-10 text-center text-sm text-text-muted">
                    Seleciona texto num parágrafo ou título para editar o formato, a cor, o fundo, o tamanho e o espaço entre letras.
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-8">
                    <CharStyles selection={selection} css={css} onEdit={onEdit} onStartEdit={setEditingCls} onCreate={onCreateStyle} onDelete={onDeleteStyle} />
                    <FormatFields value={selection} onToggle={(format) => onEdit({ target: 'inlineFormat', format })} onChange={(patch) => onEdit({ target: 'selection', patch })} />
                </div>
            )}
        </aside>
    );
};
