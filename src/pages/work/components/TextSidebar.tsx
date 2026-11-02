import React, { useState, useEffect, useRef } from 'react';
import { X, Check, RotateCcw, Plus, MoreHorizontal, Pencil, Copy, Trash2, Bold, Italic, Underline, Strikethrough, Superscript, Subscript } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { Row, Select, Section, Color, LenInput } from './panelFields';
import { FONT_FAMILIES, INLINE_FORMATS, EMPTY_SELECTION, UNDERLINE_STYLES, TRANSFORMS, WEIGHTS, selectionToCss, cssToSelection, type SelectionProps, type SelectionInfo } from '../editor/selectionProps';
import { listCharStyles, readCustomStyle, updateCustomStyle } from '../../../utils/book-css';
import { useStyles } from '../../../context/StyleContext';
import { charStyleClassOf, charStyleLabel, cloneCharStyleClass } from '../../../utils/char-styles';
import type { BlockInfo, BlockEdit } from '../editor/blockEditing';

interface TextSidebarProps {
    info: BlockInfo;                                  // só interessa o texto selecionado
    css: string;                                      // CSS atual do livro (estilos de caracteres existentes)
    onEdit: (edit: BlockEdit) => void;
    onCreateStyle: (cls: string, body: string) => string | null; // devolve o erro, ou null se criou
    onUpdateStyle: (cls: string, body: string, newCls: string) => string | null; // idem, ao guardar um estilo (newCls = nome novo, ou o mesmo)
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
            <div className="flex flex-wrap gap-2">
                {INLINE_FORMATS.map(([format, label]) => {
                    const on = value.formats.includes(format);
                    return (
                        <button key={format} type="button" title={label} aria-label={label} aria-pressed={on} onClick={() => onToggle(format)}
                            className={`h-9 w-9 rounded-lg border text-xs flex items-center justify-center transition-colors ${on ? 'bg-slate-700 border-slate-700 text-white' : 'border-border text-text-main hover:bg-slate-50'}`}>
                            {ICONS[format]}
                        </button>
                    );
                })}
            </div>
        </Section>
        <Section title="Aspeto">
            <Row label="Cor do texto"><Color value={value.color} fallback="#000000" onChange={(v) => onChange({ color: v })} /></Row>
            <Row label="Cor de fundo"><Color value={value.background} fallback="#ffffff" onChange={(v) => onChange({ background: v })} /></Row>
            <Row label="Tamanho"><LenInput value={value.fontSize} minEm={0.5} maxEm={4} stepEm={0.05} onChange={(v) => onChange({ fontSize: v })} /></Row>
            <Row label="Espaço entre letras"><LenInput value={value.letterSpacing} minEm={-0.2} maxEm={1} stepEm={0.01} onChange={(v) => onChange({ letterSpacing: v })} /></Row>
            <Row label="Tipo de letra"><Select value={value.fontFamily} options={FONT_FAMILIES} onChange={(v) => onChange({ fontFamily: v })} /></Row>
            <Row label="Maiúsculas"><Select value={value.transform} options={TRANSFORMS} onChange={(v) => onChange({ transform: v })} /></Row>
            <Row label="Peso"><Select value={value.weight} options={WEIGHTS} onChange={(v) => onChange({ weight: v })} /></Row>
        </Section>
        <Section title="Sublinhado">
            <Row label="Tipo"><Select value={value.underlineStyle} options={UNDERLINE_STYLES} onChange={(v) => onChange({ underlineStyle: v })} /></Row>
            <Row label="Cor"><Color value={value.underlineColor} fallback="#000000" onChange={(v) => onChange({ underlineColor: v, ...(v && !value.underlineStyle ? { underlineStyle: 'double' } : {}) })} /></Row>
            <Row label="Espessura"><LenInput value={value.underlineThickness} minEm={0.02} maxEm={0.3} stepEm={0.01} onChange={(v) => onChange({ underlineThickness: v, ...(v && !value.underlineStyle ? { underlineStyle: 'double' } : {}) })} /></Row>
        </Section>
        <Section title="Caixa">
            <Row label="Cor do contorno"><Color value={value.borderColor} fallback="#000000" onChange={(v) => onChange({ borderColor: v, ...(v && !value.borderWidth ? { borderWidth: { n: 1, u: 'px' } } : {}) })} /></Row>
            <Row label="Espessura"><LenInput value={value.borderWidth} placeholder={{ n: 1, u: 'px' }} minEm={0} maxEm={0.5} stepEm={0.01} onChange={(v) => onChange({ borderWidth: v })} /></Row>
            <Row label="Cantos arredondados"><LenInput value={value.radius} minEm={0} maxEm={2} stepEm={0.05} onChange={(v) => onChange({ radius: v })} /></Row>
            <Row label="Espaço interior"><LenInput value={value.padding} minEm={0} maxEm={1} stepEm={0.05} onChange={(v) => onChange({ padding: v })} /></Row>
        </Section>
    </>
);

const PanelHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="px-6 py-4 min-h-[64px] border-b border-border bg-slate-50/50 flex items-center justify-between whitespace-nowrap">
        <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Estilos de Caracteres</h3>
        <div className="flex items-center gap-1">{children}</div>
    </div>
);
const HEADER_ICON = 'p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 transition-all';

// Editar um estilo de caracteres: os mesmos controlos, sobre um rascunho lido das declarações do estilo. As declarações que os
// controlos não representam (`rest`) mantêm-se ao guardar.
const StyleEditor: React.FC<{
    cls: string; css: string; onSave: (body: string, newCls: string) => string | null; onCancel: () => void;
}> = ({ cls, css, onSave, onCancel }) => {
    const [name, setName] = useState(charStyleLabel(cls));
    const [{ selection: initial, rest }] = useState(() => cssToSelection(readCustomStyle(css, cls)));
    const [baseCss] = useState(css); // o CSS do livro sem a pré-visualização
    const [draft, setDraft] = useState<SelectionInfo>(initial);
    const { setTempCss } = useStyles();
    const bodyOf = (d: SelectionInfo) => [selectionToCss(d), ...rest.map((x) => `${x};`)].filter(Boolean).join(' ');
    // Em tempo real: cada alteração do rascunho aplica-se já ao CSS do editor (temporário); cancelar, guardar ou fechar desfaz.
    useEffect(() => {
        const preview = updateCustomStyle(baseCss, cls, bodyOf(draft));
        setTempCss('css' in preview ? preview.css : baseCss);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);
    useEffect(() => () => setTempCss(null), [setTempCss]);
    const [error, setError] = useState('');
    const change = (patch: Partial<SelectionProps>) => { setDraft({ ...draft, ...patch }); setError(''); };
    const toggle = (format: string) => {
        setDraft({ ...draft, formats: draft.formats.includes(format) ? draft.formats.filter((f) => f !== format) : [...draft.formats, format] });
        setError('');
    };
    const save = () => {
        const newCls = name.trim() === charStyleLabel(cls) ? cls : charStyleClassOf(name);
        if (!newCls) return setError('Dá um nome ao estilo.');
        const err = onSave(bodyOf(draft), newCls);
        if (err) setError(err);
    };
    return (
        <>
        <PanelHeader>
            <button onClick={save} title="Guardar" aria-label="Guardar" className={`${HEADER_ICON} hover:text-emerald-600`}><Check size={16} /></button>
            <button onClick={onCancel} title="Fechar a edição" aria-label="Fechar a edição" className={`${HEADER_ICON} hover:text-rose-500`}><X size={16} /></button>
        </PanelHeader>
        <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-8">
            <Section title="Estilo">
                <Row label="Nome">
                    <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} aria-label="Nome do estilo"
                        className="flex-1 min-w-0 h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary" />
                </Row>
                {error && <div className="text-xs text-rose-600">{error}</div>}
            </Section>
            <FormatFields value={draft} onToggle={toggle} onChange={change} />
        </div>
        </>
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
    selection: SelectionInfo; css: string; onEdit: (edit: BlockEdit) => void; onStartEdit: (cls: string) => void; onNew: () => void;
    onCreate: (cls: string, body: string) => string | null; onDelete: (cls: string) => void;
}> = ({ selection, css, onEdit, onStartEdit, onNew, onCreate, onDelete }) => {
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState<string | null>(null); // estilo à espera de confirmação para apagar
    const clone = (cls: string) => {
        const err = onCreate(cloneCharStyleClass(listCharStyles(css), cls), readCustomStyle(css, cls));
        setError(err ?? '');
    };
    return (
        <Section>
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
                <button type="button" onClick={onNew}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-dashed border-border text-xs text-text-muted hover:text-slate-700 hover:bg-slate-50">
                    <Plus size={12} /> Criar estilo…
                </button>
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
            {error && <div className="text-xs text-rose-600">{error}</div>}
        </Section>
    );
};

// Painel "Editor de Texto": só os caracteres selecionados — formato (negrito, itálico…), cor, fundo, tamanho, espaço entre
// letras, tipo de letra e estilos de caracteres. O parágrafo é do Mini-menu e do painel do bloco.
export const TextSidebar: React.FC<TextSidebarProps> = ({ info, css, onEdit, onCreateStyle, onUpdateStyle, onDeleteStyle, onClose, width, onResize }) => {
    const { selection } = info;
    const [editingCls, setEditingCls] = useState<string | null>(null);
    const [newName, setNewName] = useState<string | null>(null); // a criar um estilo: nome em curso (null = não está a criar)
    const [newError, setNewError] = useState('');
    const create = () => {
        const cls = charStyleClassOf(newName ?? '');
        if (!cls) return setNewError('Dá um nome ao estilo.');
        const body = selection ? selectionToCss(selection) : '';
        if (!body) return setNewError('A seleção não tem formato nem aspeto para guardar.');
        const err = onCreateStyle(cls, body);
        if (err) return setNewError(err);
        onEdit({ target: 'inlineFormat', format: cls }); // aplica já à seleção
        setNewName(null); setNewError('');
    };
    const cancelCreate = () => { setNewName(null); setNewError(''); };
    return (
        <aside style={{ width }} className="fixed right-4 top-[calc(var(--wp-header-h,57px)_+_32px)] bottom-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">
            <PanelResizeHandle width={width} onResize={onResize} />
            {!editingCls && (
                <PanelHeader>
                    {newName !== null && <button onClick={create} title="Criar estilo" aria-label="Criar estilo" className={`${HEADER_ICON} hover:text-emerald-600`}><Check size={16} /></button>}
                    {selection && newName === null && (
                        <button onClick={() => onEdit({ target: 'selection', patch: EMPTY_SELECTION })} title="Repor" aria-label="Repor" className={`${HEADER_ICON} hover:text-text-main`}><RotateCcw size={16} /></button>
                    )}
                    <button onClick={newName !== null ? cancelCreate : onClose} title={newName !== null ? 'Cancelar' : undefined} className={`${HEADER_ICON} hover:text-rose-500`}><X size={16} /></button>
                </PanelHeader>
            )}
            {editingCls ? (
                <StyleEditor key={editingCls} cls={editingCls} css={css}
                    onSave={(body, newCls) => { const err = onUpdateStyle(editingCls, body, newCls); if (!err) setEditingCls(null); return err; }}
                    onCancel={() => setEditingCls(null)} />
            ) : !selection ? (
                <div className="flex-1 flex items-center justify-center px-10 text-center text-sm text-text-muted">
                    Seleciona texto num parágrafo ou título para editar o formato, a cor, o fundo, o tamanho e o espaço entre letras.
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-8">
                    {newName === null ? (
                        <CharStyles selection={selection} css={css} onEdit={onEdit} onStartEdit={setEditingCls} onNew={() => setNewName('')} onCreate={onCreateStyle} onDelete={onDeleteStyle} />
                    ) : (
                        <Section title="Novo estilo">
                            <input autoFocus placeholder="Nome (ex.: Destaque)" value={newName} aria-label="Nome do estilo" onChange={(e) => { setNewName(e.target.value); setNewError(''); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') cancelCreate(); }}
                                className="h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary" />
                            {newError && <div className="text-xs text-rose-600">{newError}</div>}
                        </Section>
                    )}
                    <FormatFields value={selection} onToggle={(format) => onEdit({ target: 'inlineFormat', format })} onChange={(patch) => onEdit({ target: 'selection', patch })} />
                </div>
            )}
        </aside>
    );
};
