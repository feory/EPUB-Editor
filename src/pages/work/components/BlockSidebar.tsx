import React, { useState } from 'react';
import { X, RotateCcw, Grid2x2 } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { BOX_VARIANTS, type BoxProps, type BoxBorderStyle } from '../editor/boxProps';
import { EMPTY_TEXT, textPropsFrom, type TextProps, type TextAlign } from '../editor/textProps';
import type { BlockInfo, BlockEdit } from '../editor/blockEditing';
import { readRule, hasRule } from '../editor/cssRule';
import { GRID_RATIOS, EMPTY_GRID, type GridProps } from '../editor/gridProps';
import { IMAGE_ALIGNS, EMPTY_IMAGE, type ImageProps } from '../editor/imageProps';
import { BLOCK_STYLE_OPTIONS } from '../editor/config';

interface BlockSidebarProps {
    info: BlockInfo;                                  // caixa / bloco de texto sob o cursor
    css: string;                                      // CSS atual do livro (modo "Estilo")
    onEdit: (edit: BlockEdit) => void;                                     // edita o que está sob o cursor
    onTextStyle: (selector: string, patch: Partial<TextProps>) => void;    // modo "Estilo": regra CSS do livro
    onClose: () => void;
    width: number;
    onResize: (width: number) => void;
}

// Sem valores próprios: a caixa volta ao que o CSS do livro define para .box.
const RESET: BoxProps = { variant: '', background: '', color: '', borderColor: '', borderWidth: null, borderStyle: '', radius: null, padding: null, marginY: null, width: null };

const ALIGNS: Array<[TextAlign, string]> = [['', 'Padrão'], ['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita'], ['justify', 'Justificado']];

const BORDER_STYLES: Array<[BoxBorderStyle, string]> = [['', 'Padrão'], ['solid', 'Sólido'], ['dashed', 'Tracejado'], ['dotted', 'Pontilhado']];

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <label className="flex items-center justify-between gap-3 text-sm font-medium text-text-main">
        <span>{label}</span>
        <span className="flex items-center gap-2">{children}</span>
    </label>
);

const SELECT_CLS = 'w-28 h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary';

const Select = <T extends string>({ value, options, onChange }: { value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void }) => (
    <>
        <select value={value} onChange={e => onChange(e.target.value as T)} className={SELECT_CLS}>
            {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
        <span className="w-6" />
    </>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="flex flex-col gap-4">
        <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{title}</h4>
        {children}
    </section>
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
const Num: React.FC<{ value: number | null; unit: string; min: number; max: number; step?: number; placeholder?: number | null; onChange: (v: number | null) => void }> = ({ value, unit, min, max, step = 1, placeholder, onChange }) => {
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
                className="w-28 h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary" />
            <span className="w-6 text-xs text-text-muted">{unit}</span>
        </>
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

// Tamanho por omissão dos títulos no navegador (quando o CSS do livro não define font-size).
const HEADING_EM: Record<string, number> = { h1: 2, h2: 1.5, h3: 1.17, h4: 1, h5: 0.83, h6: 0.67 };

const TextFields: React.FC<{ value: TextProps; defaults?: Partial<TextProps>; onChange: (patch: Partial<TextProps>) => void }> = ({ value, defaults, onChange }) => (
    <>
        <Row label="Alinhamento"><Select value={value.align} options={ALIGNS} onChange={align => onChange({ align })} /></Row>
        <Row label="Recuo da 1.ª linha"><Num value={value.indent} placeholder={defaults?.indent} unit="em" min={-10} max={20} step={0.1} onChange={indent => onChange({ indent })} /></Row>
        <Row label="Margem esquerda"><Num value={value.marginLeft} placeholder={defaults?.marginLeft} unit="em" min={0} max={20} step={0.1} onChange={marginLeft => onChange({ marginLeft })} /></Row>
        <Row label="Tamanho do texto"><Num value={value.fontSize} placeholder={defaults?.fontSize} unit="em" min={0.5} max={4} step={0.05} onChange={fontSize => onChange({ fontSize })} /></Row>
        <Row label="Entrelinha"><Num value={value.lineHeight} placeholder={defaults?.lineHeight} unit="em" min={0.8} max={4} step={0.1} onChange={lineHeight => onChange({ lineHeight })} /></Row>
        <Row label="Margem em cima"><Num value={value.marginTop} placeholder={defaults?.marginTop} unit="em" min={0} max={10} step={0.1} onChange={marginTop => onChange({ marginTop })} /></Row>
        <Row label="Margem em baixo"><Num value={value.marginBottom} placeholder={defaults?.marginBottom} unit="em" min={0} max={10} step={0.1} onChange={marginBottom => onChange({ marginBottom })} /></Row>
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
    onBlockStyle: (format: string) => void;
}> = ({ text, css, onInline, onStyle, onBlockStyle }) => {
    const [mode, setMode] = useState<'block' | 'style'>('block');
    const [picked, setPicked] = useState('');
    // Alvos do modo "Estilo": classes do bloco com regra no livro + todos os blocos da mesma tag.
    const targets: Array<readonly [string, string]> = [
        ...text.classes.map((c) => `.${c}`).filter((sel) => hasRule(css, sel)).map((sel) => [sel, `Estilo ${sel}`] as const),
        [text.tag, `Todos os <${text.tag}>`],
    ];
    const selector = targets.some(([sel]) => sel === picked) ? picked : targets[0][0];
    // Valores herdados mostrados como sugestão: regra da tag/body no livro, padrão do navegador nos títulos.
    // Sem valor em nenhum: 0.
    const tagRule = textPropsFrom(readRule(css, text.tag));
    const bodyRule = textPropsFrom(readRule(css, 'body'));
    const defaults: Partial<TextProps> = {
        indent: tagRule.indent ?? 0, marginLeft: tagRule.marginLeft ?? 0,
        fontSize: tagRule.fontSize ?? HEADING_EM[text.tag] ?? bodyRule.fontSize ?? 0,
        lineHeight: tagRule.lineHeight ?? bodyRule.lineHeight ?? 0,
        marginTop: tagRule.marginTop ?? 0, marginBottom: tagRule.marginBottom ?? 0,
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
            {mode === 'style' && <p className="text-xs text-text-muted -mt-2">Altera todos os blocos com este estilo, no CSS do livro.</p>}
            <Section title={`Bloco · ${text.tag}${text.classes.length ? ' · ' + text.classes.join(' ') : ''}`}>
                {(/^h[123]$/.test(text.tag) || text.tag === 'p' || text.tag === 'li') && (
                    <Row label="Estilo">
                        <Select
                            value={/^h[123]$/.test(text.tag) ? text.tag : BLOCK_STYLE_OPTIONS.find(([f]) => text.classes.includes(f))?.[0] ?? 'p'}
                            options={BLOCK_STYLE_OPTIONS}
                            onChange={onBlockStyle}
                        />
                    </Row>
                )}
                {mode === 'block' ? (
                    <>
                        <TextFields value={text.inline} defaults={defaults} onChange={onInline} />
                        <ResetButton onClick={() => onInline(EMPTY_TEXT)} />
                    </>
                ) : (
                    <>
                        <Row label="Editar"><Select value={selector} options={targets} onChange={setPicked} /></Row>
                        <TextFields value={textPropsFrom(readRule(css, selector))} defaults={defaults} onChange={(patch) => onStyle(selector, patch)} />
                        </>
                )}
            </Section>
        </div>
    );
};

export const BlockSidebar: React.FC<BlockSidebarProps> = ({ info, css, onEdit, onTextStyle, onClose, width, onResize }) => (
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
                {info.text && <TextSection key={info.text.tag} text={info.text} css={css} onInline={(patch) => onEdit({ target: 'text', patch })} onStyle={onTextStyle} onBlockStyle={(format) => onEdit({ target: 'style', format })} />}
                {info.grid && <GridSection grid={info.grid} onChange={(patch) => onEdit({ target: 'grid', patch })} onApplyToCells={() => onEdit({ target: 'gridCells' })} />}
                {info.box && <BoxSection box={info.box} onChange={(patch) => onEdit({ target: 'box', patch })} />}
            </div>
        )}
    </aside>
);
