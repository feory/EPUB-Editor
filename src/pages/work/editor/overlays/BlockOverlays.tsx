import {
    Pilcrow, Heading1, Heading2, Heading3, Quote, Type,
    StickyNote, Image as ImageIcon, Copy, Trash2, Minus, BookMarked, Columns2, LayoutGrid, Plus, Square,
    MoreVertical, ChevronDown, SlidersHorizontal, Scissors, CopyPlus, ArrowUpToLine, ArrowDownToLine, Paintbrush, ClipboardPaste, Group, Ungroup,
} from 'lucide-react';
import { MORE_STYLES_PARA, MORE_STYLES_HEAD } from '../config';
import { BOX_VARIANTS, type BoxVariant } from '../boxProps';

type Pos = { top: number; left: number };

export type ElementAction = 'copy' | 'cut' | 'duplicate' | 'before' | 'after' | 'copyStyles' | 'pasteStyles'
    | 'group' | 'ungroup' | 'delete' | 'selectContainer' | 'duplicateContainer' | 'deleteContainer';
/** Menu "⋮" do elemento selecionado: posição + o que o menu oferece. `up`: abre para cima do botão. */
export interface ElementMenuState extends Pos { up: boolean; hasStyles: boolean; boxed: boolean; container: 'grid' | 'box' | null }

// Único sítio que define esta forma — useBlockOverlays deriva o seu "internal" bag daqui
// via Omit (readOnly é o único que atravessa de fora). A edição de HTML inline vive à parte
// (HtmlEdit.tsx).
export interface BlockOverlaysProps {
    plusMenu: Pos | null;
    gripMenu: Pos | null;
    hrCtl: Pos | null;
    menuBtn: Pos | null;                    // botão "⋮" do elemento selecionado
    elMenu: ElementMenuState | null;
    parentHandle: (Pos & { kind: 'box' | 'grid' }) | null;   // pega "selecionar grelha/caixa"
    selectParent: () => void;
    boxBar: (Pos & { kind: 'box' | 'grid'; variant: BoxVariant }) | null;   // mini-menu da caixa/grelha selecionada
    openGridPanel: () => void;                       // "Atributos" da grelha → painel de edição
    setBoxVariant: (variant: BoxVariant) => void;
    gridPlus: Pos | null;                          // "+" interno da grelha
    gridMenu: (Pos & { up: boolean }) | null;
    openGridMenu: (rect: DOMRect) => void;
    closeGridMenu: () => void;
    gridAction: (kind: 'col' | 'text' | 'image') => void;
    openElementMenu: (rect: DOMRect) => void;
    closeElementMenu: () => void;
    elementAction: (action: ElementAction) => void;
    dropLine: { top: number; left: number; width: number } | null;
    styleMenu: { top: number; left: number; kind: 'para' | 'head' } | null;
    closePlusMenu: () => void;
    plusAction: (type: string) => void;
    dismissGripMenu: (x: number, y: number) => void;
    gripAction: (action: 'duplicate' | 'delete') => void;
    setHrWidth: (full: boolean) => void;
    deleteHr: () => void;
    styleAction: (format: string) => void;
    setStyleMenu: React.Dispatch<React.SetStateAction<{ top: number; left: number; kind: 'para' | 'head' } | null>>;
    readOnly?: boolean;
}

type Props = BlockOverlaysProps;

/** Overlays estilo Notion renderizados FORA do iframe (posição fixed em coords da viewport). */
export function BlockOverlays({
    plusMenu, gripMenu, hrCtl, menuBtn, parentHandle, selectParent, boxBar, setBoxVariant, openGridPanel, gridPlus, gridMenu, openGridMenu, closeGridMenu, gridAction, elMenu, openElementMenu, closeElementMenu, elementAction, dropLine, closePlusMenu, plusAction,
    dismissGripMenu, gripAction, setHrWidth, deleteHr,
    styleMenu, styleAction, setStyleMenu, readOnly,
}: Props) {
    return (
        <>
            {plusMenu && (
                <>
                    {/* preventDefault: o editor não perde o foco → o parágrafo continua selecionado */}
                    <div className="fixed inset-0 z-[110]" onMouseDown={(e) => { e.preventDefault(); closePlusMenu(); }} />
                    <div
                        style={{ position: 'fixed', top: plusMenu.top - 10, left: plusMenu.left, transform: 'translate(-50%, -100%)', zIndex: 111 }}
                        className="w-64 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 text-sm text-slate-700"
                    >
                        <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Inserir bloco</div>
                        <div className="grid grid-cols-2 gap-0.5">
                            {([
                                ['p', 'Parágrafo', Pilcrow], ['h1', 'Título 1', Heading1], ['h2', 'Título 2', Heading2], ['h3', 'Título 3', Heading3],
                                ['p-quote', 'Citação', Quote], ['p-small', 'Texto pequeno', Type], ['footnote', 'Nota de rodapé', StickyNote], ['image', 'Imagem', ImageIcon],
                                ['hr', 'Divisória', Minus], ['grid', 'Grelha', LayoutGrid], ['chapterbreak', 'Capítulo sem Título', BookMarked],
                            ] as const).map(([type, label, Icon]) => (
                                <button
                                    key={type}
                                    type="button"
                                    onMouseDown={(ev) => ev.preventDefault()}
                                    onClick={() => plusAction(type)}
                                    className="flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
                                >
                                    <Icon size={15} className="shrink-0 text-slate-400" />
                                    <span className="truncate">{label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
            {gripMenu && (
                <>
                    {/* preventDefault: o editor não perde o foco; dismissGripMenu põe o cursor onde se clicou */}
                    <div className="fixed inset-0 z-[110]" onMouseDown={(e) => { e.preventDefault(); dismissGripMenu(e.clientX, e.clientY); }} />
                    <div
                        style={{ position: 'fixed', top: gripMenu.top, left: gripMenu.left, zIndex: 111 }}
                        className="w-48 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 text-sm text-slate-700"
                    >
                        {([['duplicate', 'Duplicar', Copy], ['delete', 'Eliminar', Trash2]] as const).map(([action, label, Icon]) => (
                            <button
                                key={action}
                                type="button"
                                onMouseDown={(ev) => ev.preventDefault()}
                                onClick={() => gripAction(action)}
                                className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg transition-colors ${action === 'delete' ? 'text-rose-600 hover:bg-rose-50' : 'hover:bg-slate-100 active:bg-slate-200'}`}
                            >
                                <Icon size={15} className={`shrink-0 ${action === 'delete' ? 'text-rose-500' : 'text-slate-400'}`} />
                                <span className="truncate">{label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
            {styleMenu && (
                <>
                    <div
                        data-style-menu
                        onMouseLeave={() => setStyleMenu(null)}
                        style={{ position: 'fixed', top: styleMenu.top, left: styleMenu.left, zIndex: 1401 }}
                        className="w-72 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 text-sm text-slate-700"
                    >
                        <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Estilos</div>
                        <div className="grid grid-cols-2 gap-0.5">
                            {(styleMenu.kind === 'para' ? MORE_STYLES_PARA : MORE_STYLES_HEAD).map(([format, label]) => (
                                <button
                                    key={format}
                                    type="button"
                                    onMouseDown={(ev) => ev.preventDefault()}
                                    onClick={() => styleAction(format)}
                                    className="text-left truncate px-2 py-1.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
            {hrCtl && !readOnly && (
                <div
                    style={{ position: 'fixed', top: hrCtl.top, left: hrCtl.left, transform: 'translate(-50%, -50%)', zIndex: 100 }}
                    onMouseDown={(ev) => ev.preventDefault()}
                    className="flex gap-0.5 p-0.5 rounded-lg border border-slate-200 bg-white shadow-md ring-1 ring-black/5 text-xs text-slate-600"
                >
                    <button type="button" onClick={() => setHrWidth(false)} className="px-2 py-1 rounded hover:bg-slate-100">Pequena</button>
                    <button type="button" onClick={() => setHrWidth(true)} className="px-2 py-1 rounded hover:bg-slate-100">Larga</button>
                    <div className="w-px my-0.5 bg-slate-200" />
                    <button type="button" title="Eliminar divisória" onClick={deleteHr} className="flex items-center px-2 py-1 rounded text-slate-600 hover:bg-slate-100">
                        <Trash2 size={13} />
                    </button>
                </div>
            )}
            {!readOnly && menuBtn && (
                // preventDefault no mousedown: o editor não perde o foco (senão o anel e o botão desapareciam antes do clique)
                <button
                    type="button" title="Opções do bloco"
                    onMouseDown={(ev) => ev.preventDefault()} onClick={(ev) => openElementMenu(ev.currentTarget.getBoundingClientRect())}
                    style={{ position: 'fixed', top: menuBtn.top, left: menuBtn.left, zIndex: 100 }}
                    className="w-6 h-6 flex items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                >
                    <MoreVertical size={14} />
                </button>
            )}
            {!readOnly && parentHandle && (
                <button
                    type="button" title={parentHandle.kind === 'grid' ? 'Selecionar a grelha' : 'Selecionar a caixa'}
                    onMouseDown={(ev) => ev.preventDefault()} onClick={selectParent}
                    style={{ position: 'fixed', top: parentHandle.top, left: parentHandle.left, zIndex: 100 }}
                    className="w-6 h-6 flex items-center justify-center rounded-md border border-slate-200 bg-white shadow-sm text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                >
                    {parentHandle.kind === 'grid' ? <LayoutGrid size={14} /> : <Square size={14} />}
                </button>
            )}
            {!readOnly && boxBar && (
                // Mesmo aspeto do mini-menu do TinyMCE (cartão branco, botões de 36px, ícones grandes, hover cinzento).
                <div
                    style={{ position: 'fixed', top: boxBar.top, left: boxBar.left, zIndex: 100 }}
                    className="h-12 flex items-center gap-1 px-1.5 rounded-lg border border-slate-200 bg-white shadow-lg"
                >
                    <button
                        type="button" title={boxBar.kind === 'grid' ? 'Opções da grelha' : 'Opções da caixa'}
                        onMouseDown={(ev) => ev.preventDefault()} onClick={(ev) => openElementMenu(ev.currentTarget.getBoundingClientRect())}
                        className="w-9 h-9 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        <MoreVertical size={22} />
                    </button>
                    {boxBar.kind === 'box' ? (
                        <label className="relative flex items-center" title="Tipo de caixa">
                            <select
                                value={boxBar.variant}
                                onChange={(ev) => setBoxVariant(ev.target.value as BoxVariant)}
                                className="h-9 pl-3 pr-8 rounded-md bg-transparent hover:bg-slate-200 text-sm font-medium text-slate-600 outline-none appearance-none cursor-pointer transition-colors"
                            >
                                {BOX_VARIANTS.map(([v, label]) => <option key={v} value={v}>{v ? label : 'Caixa'}</option>)}
                            </select>
                            <ChevronDown size={16} className="pointer-events-none absolute right-2 text-slate-500" />
                        </label>
                    ) : (
                        <button
                            type="button" title="Editar os atributos da grelha (borda, espessura, cantos, fundo…)" aria-label="Atributos"
                            onMouseDown={(ev) => ev.preventDefault()} onClick={openGridPanel}
                            className="h-9 w-9 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                            <SlidersHorizontal size={18} />
                        </button>
                    )}
                </div>
            )}
            {!readOnly && gridPlus && (
                <button
                    type="button" title="Adicionar à grelha"
                    onMouseDown={(ev) => ev.preventDefault()} onClick={(ev) => openGridMenu(ev.currentTarget.getBoundingClientRect())}
                    style={{ position: 'fixed', top: gridPlus.top, left: gridPlus.left, zIndex: 100 }}
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 text-white shadow-md hover:bg-slate-700 transition-colors"
                >
                    <Plus size={15} />
                </button>
            )}
            {gridMenu && (
                <>
                    <div className="fixed inset-0 z-[110]" onMouseDown={(e) => { e.preventDefault(); closeGridMenu(); }} />
                    <div
                        style={{ position: 'fixed', top: gridMenu.top, left: gridMenu.left, transform: `translate(-50%, ${gridMenu.up ? '-100%' : '0'})`, zIndex: 111 }}
                        className="w-44 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 text-sm text-slate-700"
                    >
                        <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Adicionar à grelha</div>
                        {([['col', 'Coluna', Columns2], ['text', 'Texto', Type], ['image', 'Imagem', ImageIcon]] as const).map(([kind, label, Icon]) => (
                            <button
                                key={kind} type="button"
                                onMouseDown={(ev) => ev.preventDefault()} onClick={() => gridAction(kind)}
                                className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
                            >
                                <Icon size={15} className="shrink-0 text-slate-400" />
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
            {elMenu && (
                <>
                    <div className="fixed inset-0 z-[110]" onMouseDown={(e) => { e.preventDefault(); closeElementMenu(); }} />
                    <div
                        style={{ position: 'fixed', top: elMenu.top, left: elMenu.left, transform: `translate(-100%, ${elMenu.up ? '-100%' : '0'})`, zIndex: 111 }}
                        className="w-60 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 text-sm text-slate-700"
                    >
                        {([
                            [['copy', 'Copiar', Copy], ['cut', 'Cortar', Scissors], ['duplicate', 'Duplicar', CopyPlus],
                                ['before', 'Inserir antes', ArrowUpToLine], ['after', 'Inserir depois', ArrowDownToLine]],
                            [['copyStyles', 'Copiar estilos', Paintbrush], ...(elMenu.hasStyles ? [['pasteStyles', 'Colar estilos', ClipboardPaste]] : [])],
                            [elMenu.boxed ? ['ungroup', 'Desagrupar da caixa', Ungroup] : ['group', 'Agrupar numa caixa', Group]],
                            ...(elMenu.container ? [[
                                ['selectContainer', `Selecionar ${elMenu.container === 'grid' ? 'grelha' : 'caixa'}`, elMenu.container === 'grid' ? LayoutGrid : Square],
                                ['duplicateContainer', `Duplicar ${elMenu.container === 'grid' ? 'grelha' : 'caixa'}`, CopyPlus],
                                ['deleteContainer', `Eliminar ${elMenu.container === 'grid' ? 'grelha' : 'caixa'}`, Trash2],
                            ]] : []),
                            [['delete', 'Eliminar', Trash2]],
                        ] as unknown as Array<Array<[ElementAction, string, typeof Copy]>>).map((group, gi) => (
                            <div key={gi} className={gi ? 'mt-1 pt-1 border-t border-slate-100' : ''}>
                                {group.map(([action, label, Icon]) => {
                                    const danger = action === 'delete' || action === 'deleteContainer';
                                    return (
                                        <button
                                            key={action} type="button"
                                            onMouseDown={(ev) => ev.preventDefault()} onClick={() => elementAction(action)}
                                            className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg transition-colors ${danger ? 'text-rose-600 hover:bg-rose-50' : 'hover:bg-slate-100 active:bg-slate-200'}`}
                                        >
                                            <Icon size={15} className={`shrink-0 ${danger ? 'text-rose-500' : 'text-slate-400'}`} />
                                            <span className="truncate">{label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </>
            )}
            {dropLine && (
                <div
                    style={{ position: 'fixed', top: dropLine.top - 1, left: dropLine.left, width: dropLine.width, height: 2, background: '#475569', zIndex: 100, pointerEvents: 'none' }}
                />
            )}
        </>
    );
}
