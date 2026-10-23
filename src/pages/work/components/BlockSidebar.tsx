import React, { useState, useRef, useEffect } from 'react';
import { X, Check, RotateCcw, Grid2x2, Pencil, Plus } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { BOX_VARIANTS, type BoxProps, type BoxBorderStyle } from '../editor/boxProps';
import { EMPTY_TEXT, textPropsFrom, textPatchToDecls, convertLen, type TextProps, type TextAlign, type Len, type Unit } from '../editor/textProps';
import type { BlockInfo, BlockEdit } from '../editor/blockEditing';
import { readRule, hasRule } from '../../../utils/css-rule';
import { GRID_RATIOS, EMPTY_GRID, type GridProps } from '../editor/gridProps';
import { IMAGE_ALIGNS, EMPTY_IMAGE, type ImageProps } from '../editor/imageProps';
import { BLOCK_STYLE_OPTIONS } from '../editor/config';
import { listCustomStyles, styleClassOf } from '../../../utils/book-css';

interface BlockSidebarProps {
    info: BlockInfo;                                  // caixa / bloco de texto sob o cursor
    css: string;                                      // CSS atual do livro (modo "Estilo")
    onEdit: (edit: BlockEdit) => void;                                     // edita o que está sob o cursor
    onTextStyle: (selector: string, patch: Partial<TextProps>) => void;    // modo "Estilo": regra CSS do livro
    onCreateStyle: (cls: string, body: string) => string | null;          // estilo personalizado novo; devolve o erro, ou null se criou
    onClose: () => void;
    width: number;
    onResize: (width: number) => void;
}

// Sem valores próprios: a caixa volta ao que o CSS do livro define para .box.
const RESET: BoxProps = { variant: '', background: '', color: '', borderColor: '', borderWidth: null, borderStyle: '', radius: null, padding: null, marginY: null, width: null };

const ALIGNS: Array<[TextAlign, string]> = [['', 'Padrão'], ['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita'], ['justify', 'Justificado']];

// Formato do texto: combinável; marcado = valor CSS, desmarcado = herda ('').
const FORMATS: Array<[keyof TextProps, string, string]> = [
    ['fontWeight', 'bold', 'Negrito'], ['fontStyle', 'italic', 'Itálico'],
    ['fontVariant', 'small-caps', 'Versaletes'], ['textTransform', 'uppercase', 'Maiúsculas'],
];

// Estilos de parágrafo que já dão negrito/itálico/maiúsculas: contam como marcados no Formato.
const CLASS_FORMATS: Record<string, Array<keyof TextProps>> = {
    'p-bold': ['fontWeight'], 'p-italic': ['fontStyle'], 'p-bold-italic': ['fontWeight', 'fontStyle'], 'p-uppercase': ['textTransform'],
};
const classesGiving = (key: keyof TextProps, classes: string[]) => classes.filter((c) => CLASS_FORMATS[c]?.includes(key));

// Combobox de escolha múltipla: o botão resume o que está ligado, a lista tem uma caixa por opção.
const FormatCombo: React.FC<{
    value: TextProps; classes: string[]; onChange: (patch: Partial<TextProps>) => void; onToggleClass?: (cls: string, on: boolean) => void;
}> = ({ value, classes, onChange, onToggleClass }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', away);
        return () => document.removeEventListener('mousedown', away);
    }, [open]);
    const isOn = (key: keyof TextProps, css: string) => value[key] === css || classesGiving(key, classes).length > 0;
    const toggle = (key: keyof TextProps, css: string, on: boolean) => {
        if (on) return onChange({ [key]: css });
        onChange({ [key]: '' });
        // Desmarcar tira também o estilo de parágrafo que dava este formato (p-bold-italic mantém a outra metade).
        classesGiving(key, classes).forEach((c) => {
            onToggleClass?.(c, false);
            if (c === 'p-bold-italic') onToggleClass?.(key === 'fontWeight' ? 'p-italic' : 'p-bold', true);
        });
    };
    const on = FORMATS.filter(([key, css]) => isOn(key, css)).map(([, , label]) => label);
    return (
        <div className="flex items-center justify-between gap-3 text-sm font-medium text-text-main">
            <span>Formato</span>
            <div ref={ref} className="relative w-44">
                <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}
                    className="select-chevron w-full h-9 rounded-lg border border-border pl-2 pr-8 text-sm text-left truncate outline-none focus:border-primary">
                    {on.join(', ') || 'Padrão'}
                </button>
                {open && (
                    <div role="listbox" aria-multiselectable className="absolute right-0 top-10 z-10 w-full rounded-lg border border-border bg-white shadow-md p-1">
                        {FORMATS.map(([key, css, label]) => (
                            <label key={key} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm font-normal cursor-pointer hover:bg-slate-50">
                                <input type="checkbox" className="sr-only peer" checked={isOn(key, css)} onChange={(e) => toggle(key, css, e.target.checked)} />
                                <span className="w-4 h-4 flex items-center justify-center rounded border border-slate-400 bg-white text-white peer-checked:bg-slate-700 peer-checked:border-slate-700 peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                                    {isOn(key, css) && <Check size={12} strokeWidth={3} />}
                                </span>
                                <span className={isOn(key, css) ? 'font-semibold' : ''}>{label}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const BORDER_STYLES: Array<[BoxBorderStyle, string]> = [['', 'Padrão'], ['solid', 'Sólido'], ['dashed', 'Tracejado'], ['dotted', 'Pontilhado']];

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
const Num: React.FC<{ value: number | null; unit: string; min: number; max: number; step?: number; placeholder?: number | null; suffix?: React.ReactNode; onChange: (v: number | null) => void }> = ({ value, unit, min, max, step = 1, placeholder, suffix, onChange }) => {
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

const BoxSection: React.FC<{ box: BoxProps; onChange: (patch: Partial<BoxProps>) => void }> = ({ box, onChange }) => (
    <Section title="Caixa">
        <Row label="Tipo"><Select value={box.variant} options={BOX_VARIANTS} onChange={variant => onChange({ variant })} /></Row>
        <Row label="Cor de fundo"><Color value={box.background} fallback="#ffffff" onChange={background => onChange({ background })} /></Row>
        <Row label="Cor do texto"><Color value={box.color} fallback="#000000" onChange={color => onChange({ color })} /></Row>
        <Row label="Cor do contorno"><Color value={box.borderColor} fallback="#000000" onChange={borderColor => onChange({ borderColor })} /></Row>
        <Row label="Espessura do contorno"><Num value={box.borderWidth} unit="px" min={0} max={10} onChange={borderWidth => onChange({ borderWidth })} /></Row>
        <Row label="Estilo do contorno"><Select value={box.borderStyle} options={BORDER_STYLES} onChange={borderStyle => onChange({ borderStyle })} /></Row>
        <Row label="Cantos arredondados"><Num value={box.radius} unit="px" min={0} max={40} onChange={radius => onChange({ radius })} /></Row>
        <Row label="Espaço interior"><Num value={box.padding} unit="em" min={0} max={5} step={0.1} onChange={padding => onChange({ padding })} /></Row>
        <Row label="Margem cima/baixo"><Num value={box.marginY} unit="em" min={0} max={5} step={0.1} onChange={marginY => onChange({ marginY })} /></Row>
        <Row label="Largura"><Num value={box.width} unit="%" min={30} max={100} onChange={width => onChange({ width })} /></Row>
        <ResetButton onClick={() => onChange(RESET)} />
    </Section>
);

const ResetButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button type="button" onClick={onClick}
        className="self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-slate-50 transition-colors">
        <RotateCcw size={16} />
        <span>Repor</span>
    </button>
);

// Estilos combináveis de um parágrafo/item (tudo o que não é título nem o 'Padrão').
const COMBINABLE_STYLES = BLOCK_STYLE_OPTIONS.filter(([f]) => !/^(h[1-3]|p)$/.test(f));

// "Criar estilo…": botão + formulário (nome + os campos de texto) que cria a classe no CSS do livro.
// O estado (`draft`) vive em TextSection: com o formulário aberto os campos do bloco/regra atual escondem-se.
interface StyleDraft { name: string; props: TextProps; error: string }

const NewStyleButton: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
    <button type="button" onClick={onOpen}
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-dashed border-border text-xs text-text-muted hover:text-slate-700 hover:bg-slate-50">
        <Plus size={12} /> Criar estilo…
    </button>
);

const NewStyleForm: React.FC<{
    draft: StyleDraft; setDraft: (d: StyleDraft | null) => void;
    onCreate: (cls: string, body: string) => string | null; onCreated: (cls: string) => void;
}> = ({ draft, setDraft, onCreate, onCreated }) => {
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const cls = styleClassOf(draft.name);
        if (!cls) return setDraft({ ...draft, error: 'Dá um nome ao estilo.' });
        // !important como as restantes classes de parágrafo do livro (.p-center…).
        const body = textPatchToDecls(draft.props).flatMap(([n, v]) => v === null ? [] : [`${n}: ${v} !important;`]).join(' ');
        if (!body) return setDraft({ ...draft, error: 'Define pelo menos um campo.' });
        const error = onCreate(cls, body);
        if (error) return setDraft({ ...draft, error });
        onCreated(cls);
        setDraft(null);
    };
    return (
        <form onSubmit={submit} className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-slate-50">
            <input autoFocus placeholder="Nome (ex.: Epígrafe)" value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value, error: '' })}
                className="px-2 py-1.5 rounded-md border border-border bg-white text-sm" />
            <TextFields value={draft.props} onChange={(patch) => setDraft({ ...draft, props: { ...draft.props, ...patch }, error: '' })} />
            {draft.error && <div className="text-xs text-rose-600">{draft.error}</div>}
            <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setDraft(null)} className="px-3 py-1.5 rounded-md text-xs text-text-muted hover:bg-slate-100">Cancelar</button>
                <button type="submit" className="px-3 py-1.5 rounded-md text-xs font-bold bg-slate-700 text-white hover:bg-slate-600">Criar e aplicar</button>
            </div>
        </form>
    );
};

// Um chip por estilo do bloco (× tira) + escolha para acrescentar outro: um parágrafo pode ter vários.
const StyleChips: React.FC<{
    classes: string[]; css: string; creating: boolean; onNew: () => void; onToggle: (cls: string, on: boolean) => void;
}> = ({ classes, css, creating, onNew, onToggle }) => {
    const all: Array<readonly [string, string]> = [...COMBINABLE_STYLES, ...listCustomStyles(css).map((c) => [c, c] as const)];
    const active = all.filter(([f]) => classes.includes(f));
    const free = all.filter(([f]) => !classes.includes(f));
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {active.map(([f, label]) => (
                <span key={f} className="inline-flex items-center gap-1 pl-2.5 pr-1 h-7 rounded-full bg-slate-200 text-xs font-medium text-slate-700">
                    {label}
                    <button type="button" title="Tirar este estilo" onClick={() => onToggle(f, false)}
                        className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-300"><X size={12} /></button>
                </span>
            ))}
            {free.length > 0 && (
                <select value="" onChange={(e) => e.target.value && onToggle(e.target.value, true)} aria-label="Novo estilo"
                    className="select-chevron h-7 rounded-full border border-border pl-2.5 pr-7 text-xs text-text-muted outline-none cursor-pointer">
                    <option value="">+ Novo estilo</option>
                    {free.map(([f, label]) => <option key={f} value={f}>{label}</option>)}
                </select>
            )}
            {!creating && <NewStyleButton onOpen={onNew} />}
        </div>
    );
};

// Modo "Estilo": um chip por estilo do bloco, com lápis — escolher qual regra do livro se edita
// (vale para todo o projeto), mais "Todos os <tag>".
const StyleEditChips: React.FC<{ targets: Array<readonly [string, string]>; selected: string; onPick: (sel: string) => void }> = ({ targets, selected, onPick }) => (
    <div className="flex flex-wrap items-center gap-1.5">
        {targets.map(([sel, label]) => (
            <button key={sel} type="button" onClick={() => onPick(sel)} title={`Editar ${sel} em todo o projeto`}
                className={`inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-medium transition-colors ${sel === selected ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>
                <Pencil size={11} />
                {label}
            </button>
        ))}
    </div>
);

// Tamanho por omissão dos títulos no navegador (quando o CSS do livro não define font-size).
const HEADING_EM: Record<string, number> = { h1: 2, h2: 1.5, h3: 1.17, h4: 1, h5: 0.83, h6: 0.67 };
const em = (n: number): Len => ({ n, u: 'em' });

const TextFields: React.FC<{
    value: TextProps; defaults?: Partial<TextProps>; onChange: (patch: Partial<TextProps>) => void;
    classes?: string[]; onToggleClass?: (cls: string, on: boolean) => void;
}> = ({ value, defaults, onChange, classes = [], onToggleClass }) => (
    <>
        <Row label="Alinhamento"><Select value={value.align} options={ALIGNS} onChange={align => onChange({ align })} /></Row>
        <FormatCombo value={value} classes={classes} onChange={onChange} onToggleClass={onToggleClass} />
        <Row label="Recuo da 1.ª linha"><LenInput value={value.indent} placeholder={defaults?.indent} minEm={-10} maxEm={20} stepEm={0.1} onChange={indent => onChange({ indent: indent })} /></Row>
        <Row label="Margem esquerda"><LenInput value={value.marginLeft} placeholder={defaults?.marginLeft} minEm={0} maxEm={20} stepEm={0.1} onChange={marginLeft => onChange({ marginLeft: marginLeft })} /></Row>
        <Row label="Tamanho do texto"><LenInput value={value.fontSize} placeholder={defaults?.fontSize} minEm={0.5} maxEm={4} stepEm={0.05} onChange={fontSize => onChange({ fontSize: fontSize })} /></Row>
        <Row label="Entrelinha"><LenInput value={value.lineHeight} placeholder={defaults?.lineHeight} minEm={0.8} maxEm={4} stepEm={0.1} onChange={lineHeight => onChange({ lineHeight: lineHeight })} /></Row>
        <Row label="Margem em cima"><LenInput value={value.marginTop} placeholder={defaults?.marginTop} minEm={0} maxEm={10} stepEm={0.1} onChange={marginTop => onChange({ marginTop: marginTop })} /></Row>
        <Row label="Margem em baixo"><LenInput value={value.marginBottom} placeholder={defaults?.marginBottom} minEm={0} maxEm={10} stepEm={0.1} onChange={marginBottom => onChange({ marginBottom: marginBottom })} /></Row>
        <Row label="Cor do texto"><Color value={value.color} fallback="#000000" onChange={color => onChange({ color })} /></Row>
    </>
);

const ImageSection: React.FC<{ image: ImageProps; onChange: (patch: Partial<ImageProps>) => void }> = ({ image, onChange }) => {
    const [alt, setAlt] = useState<string | null>(null); // rascunho: só grava ao sair/Enter (1 passo de undo)
    const commitAlt = () => { if (alt !== null && alt !== image.alt) onChange({ alt }); setAlt(null); };
    return (
        <Section title="Imagem">
            <Row label="Alinhamento"><Select value={image.align} options={IMAGE_ALIGNS} onChange={align => onChange({ align })} /></Row>
            <Row label="Largura"><Num value={image.width} unit="%" min={5} max={100} onChange={width => onChange({ width })} /></Row>
            <Row label="Margem em cima"><Num value={image.marginTop} unit="em" min={0} max={10} step={0.1} onChange={marginTop => onChange({ marginTop })} /></Row>
            <Row label="Margem em baixo"><Num value={image.marginBottom} unit="em" min={0} max={10} step={0.1} onChange={marginBottom => onChange({ marginBottom })} /></Row>
            <Row label="Deslocamento vertical"><Num value={image.offsetY} unit="px" min={-200} max={200} onChange={offsetY => onChange({ offsetY })} /></Row>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-text-main">
                <span>Texto alternativo</span>
                <textarea rows={2} value={alt ?? image.alt} placeholder="Descreve a imagem (acessibilidade)"
                    onChange={e => setAlt(e.target.value)} onBlur={commitAlt}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitAlt(); } }}
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-primary resize-none" />
            </label>
            <ResetButton onClick={() => onChange({ ...EMPTY_IMAGE, align: image.align, alt: image.alt })} />
        </Section>
    );
};

const GridSection: React.FC<{
    grid: GridProps; onChange: (patch: Partial<GridProps>) => void; onApplyToCells: () => void;
}> = ({ grid, onChange, onApplyToCells }) => (
    <Section title="Grelha">
        <Row label="Proporção"><Select value={grid.ratio} options={GRID_RATIOS} onChange={ratio => onChange({ ratio })} /></Row>
        <Row label="Espaço entre células"><Num value={grid.gap} unit="em" min={0} max={6} step={0.1} onChange={gap => onChange({ gap })} /></Row>
        <Row label="Cor de fundo"><Color value={grid.background} fallback="#ffffff" onChange={background => onChange({ background })} /></Row>
        <Row label="Cor do contorno"><Color value={grid.borderColor} fallback="#000000" onChange={borderColor => onChange({ borderColor })} /></Row>
        <Row label="Espessura do contorno"><Num value={grid.borderWidth} unit="px" min={0} max={10} onChange={borderWidth => onChange({ borderWidth })} /></Row>
        <Row label="Estilo do contorno"><Select value={grid.borderStyle} options={BORDER_STYLES} onChange={borderStyle => onChange({ borderStyle })} /></Row>
        <Row label="Cantos arredondados"><Num value={grid.radius} unit="px" min={0} max={40} onChange={radius => onChange({ radius })} /></Row>
        <Row label="Espaço interior"><Num value={grid.padding} unit="em" min={0} max={5} step={0.1} onChange={padding => onChange({ padding })} /></Row>
        <p className="text-xs text-text-muted">A linha tracejada cinzenta é só do editor. Em ecrãs estreitos as células passam a uma por linha.</p>
        <div className="flex flex-wrap gap-2">
            <ResetButton onClick={() => onChange(EMPTY_GRID)} />
            <button type="button" onClick={onApplyToCells} title="Copia contorno, cantos e fundo a cada célula da grelha"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-slate-50 transition-colors">
                <Grid2x2 size={16} />
                <span>Aplicar às células</span>
            </button>
        </div>
    </Section>
);

const MODES = [['block', 'Este bloco'], ['style', 'Estilo']] as const;

const TextSection: React.FC<{
    text: NonNullable<BlockInfo['text']>; css: string;
    onInline: (patch: Partial<TextProps>) => void; onStyle: (selector: string, patch: Partial<TextProps>) => void;
    onToggleClass: (cls: string, on: boolean) => void; onCreateStyle: (cls: string, body: string) => string | null;
}> = ({ text, css, onInline, onStyle, onToggleClass, onCreateStyle }) => {
    const [mode, setMode] = useState<'block' | 'style'>('block');
    const [picked, setPicked] = useState('');
    const [draft, setDraft] = useState<StyleDraft | null>(null); // criar estilo: esconde os campos do bloco/regra atual
    const startDraft = () => setDraft({ name: '', props: EMPTY_TEXT, error: '' });
    // Alvos do modo "Estilo": estilos conhecidos do bloco (a regra cria-se se faltar) ou com regra no livro + todos os blocos da mesma tag.
    const targets: Array<readonly [string, string]> = [
        ...text.classes.flatMap((c) => {
            const label = COMBINABLE_STYLES.find(([f]) => f === c)?.[1] ?? (hasRule(css, `.${c}`) ? `.${c}` : null);
            return label ? [[`.${c}`, label] as const] : [];
        }),
        [text.tag, `Todos os <${text.tag}>`],
    ];
    const selector = targets.some(([sel]) => sel === picked) ? picked : targets[0][0];
    // Valores herdados mostrados como sugestão: regra da tag/body no livro, padrão do navegador nos títulos.
    // Sem valor em nenhum: 0.
    const tagRule = textPropsFrom(readRule(css, text.tag));
    const bodyRule = textPropsFrom(readRule(css, 'body'));
    const defaults: Partial<TextProps> = {
        indent: tagRule.indent ?? em(0), marginLeft: tagRule.marginLeft ?? em(0),
        fontSize: tagRule.fontSize ?? (HEADING_EM[text.tag] ? em(HEADING_EM[text.tag]) : bodyRule.fontSize) ?? em(0),
        lineHeight: tagRule.lineHeight ?? bodyRule.lineHeight ?? em(0),
        marginTop: tagRule.marginTop ?? em(0), marginBottom: tagRule.marginBottom ?? em(0),
    };
    return (
        <div className="flex flex-col gap-4">
            <div className="flex rounded-lg border border-border p-0.5 bg-slate-50">
                {MODES.map(([m, label]) => (
                    <button key={m} type="button" onClick={() => setMode(m)}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${mode === m ? 'bg-white shadow-sm text-slate-800' : 'text-text-muted hover:text-slate-700'}`}>
                        {label}
                    </button>
                ))}
            </div>
            <Section>
                {mode === 'block' && (text.tag === 'p' || text.tag === 'li') && <StyleChips classes={text.classes} css={css} creating={!!draft} onNew={startDraft} onToggle={onToggleClass} />}
                {draft && <NewStyleForm draft={draft} setDraft={setDraft} onCreate={onCreateStyle}
                    onCreated={(cls) => { onToggleClass(cls, true); setPicked(`.${cls}`); }} />}
                {mode === 'block' ? (draft ? null : (
                    <>
                        <TextFields value={text.inline} defaults={defaults} onChange={onInline} classes={text.classes} onToggleClass={onToggleClass} />
                        <ResetButton onClick={() => onInline(EMPTY_TEXT)} />
                    </>
                )) : (
                    <>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <StyleEditChips targets={targets} selected={selector} onPick={setPicked} />
                            {!draft && <NewStyleButton onOpen={startDraft} />}
                        </div>
                        {!draft && <TextFields value={textPropsFrom(readRule(css, selector))} defaults={defaults} onChange={(patch) => onStyle(selector, patch)} />}
                    </>
                )}
            </Section>
        </div>
    );
};

export const BlockSidebar: React.FC<BlockSidebarProps> = ({ info, css, onEdit, onTextStyle, onCreateStyle, onClose, width, onResize }) => (
    <aside style={{ width }} className="fixed right-4 top-[calc(var(--wp-header-h,57px)_+_32px)] bottom-8 bg-surface rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">
        <PanelResizeHandle width={width} onResize={onResize} />
        <div className="px-6 py-4 min-h-[64px] border-b border-border bg-slate-50/50 flex items-center justify-between whitespace-nowrap">
            <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Edição do Bloco</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all"><X size={16} /></button>
        </div>
        {!info.box && !info.text && !info.image && !info.grid ? (
            <div className="flex-1 flex items-center justify-center px-10 text-center text-sm text-text-muted">
                Põe o cursor num parágrafo, título ou caixa, ou seleciona uma imagem, para editar os seus atributos.
            </div>
        ) : (
            <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-8">
                {info.image && <ImageSection image={info.image} onChange={(patch) => onEdit({ target: 'image', patch })} />}
                {info.text && <TextSection key={info.text.tag} text={info.text} css={css} onInline={(patch) => onEdit({ target: 'text', patch })} onStyle={onTextStyle} onCreateStyle={onCreateStyle} onToggleClass={(cls, on) => onEdit({ target: 'class', cls, on })} />}
                {info.grid && <GridSection grid={info.grid} onChange={(patch) => onEdit({ target: 'grid', patch })} onApplyToCells={() => onEdit({ target: 'gridCells' })} />}
                {info.box && <BoxSection box={info.box} onChange={(patch) => onEdit({ target: 'box', patch })} />}
            </div>
        )}
    </aside>
);
