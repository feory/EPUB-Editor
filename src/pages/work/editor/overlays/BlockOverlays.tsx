import {
    Plus, GripVertical, ChevronUp, ChevronDown, Pilcrow, Heading1, Heading2, Heading3, Quote, Type,
    StickyNote, Image as ImageIcon, Copy, Trash2, Minus, X, Save, BookMarked,
} from 'lucide-react';
import type { BlockOverlaysApi } from '../useBlockOverlays';
import { MORE_STYLES_PARA, MORE_STYLES_HEAD } from '../config';

type Props = BlockOverlaysApi & { readOnly?: boolean };

/** Overlays estilo Notion renderizados FORA do iframe (posição fixed em coords da viewport). */
export function BlockOverlays({
    addBtnPos, addBtnFading, plusMenu, gripPos, gripFading, gripMenu, hrCtl, htmlEdit, htmlEditPos, dropLine,
    htmlTextareaRef, openPlusMenu, closePlusMenu, plusAction, cancelAddBtnHide, clearAddBtn,
    startBlockDrag, moveBlock, setGripMenu, gripAction, setHrWidth, deleteHr, endHtmlEdit, saveHtmlEdit,
    styleMenu, styleAction, setStyleMenu, readOnly,
}: Props) {
    return (
        <>
            {addBtnPos && !readOnly && (
                <button
                    type="button"
                    title="Adicionar parágrafo"
                    onMouseDown={(e) => e.preventDefault()} // manter foco no editor (evita blur→esconder)
                    onMouseEnter={cancelAddBtnHide} // rato no botão → não esconder
                    onMouseLeave={clearAddBtn}      // saiu do botão → esconder
                    onClick={openPlusMenu}
                    style={{ position: 'fixed', top: addBtnPos.top, left: addBtnPos.left, zIndex: 100, opacity: addBtnFading ? 0 : 1 }}
                    className="add-para-pop flex items-center justify-center w-5 h-5 rounded-full bg-white hover:bg-slate-100 text-slate-700 shadow-md border border-slate-200 transition-opacity duration-300 ease-out"
                >
                    <Plus size={12} />
                </button>
            )}
            {plusMenu && (
                <>
                    <div className="fixed inset-0 z-[110]" onMouseDown={closePlusMenu} />
                    <div
                        style={{ position: 'fixed', top: plusMenu.top - 10, left: plusMenu.left, transform: 'translate(-50%, -100%)', zIndex: 111 }}
                        className="w-64 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 text-sm text-slate-700"
                    >
                        <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Inserir bloco</div>
                        <div className="grid grid-cols-2 gap-0.5">
                            {([
                                ['p', 'Parágrafo', Pilcrow], ['h1', 'Título 1', Heading1], ['h2', 'Título 2', Heading2], ['h3', 'Título 3', Heading3],
                                ['p-quote', 'Citação', Quote], ['p-small', 'Texto pequeno', Type], ['footnote', 'Nota de rodapé', StickyNote], ['image', 'Imagem', ImageIcon],
                                ['hr', 'Divisória', Minus], ['chapterbreak', 'Capítulo sem Título', BookMarked],
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
            {gripPos && !readOnly && (
                <div
                    style={{ position: 'fixed', top: gripPos.top, left: gripPos.left, zIndex: 100, opacity: gripFading ? 0 : 1 }}
                    className="add-para-pop flex flex-col items-center w-5 rounded-md bg-white text-slate-700 shadow-md border border-slate-200 overflow-hidden transition-opacity duration-300 ease-out"
                >
                    <button
                        type="button"
                        title="Mover para cima"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => moveBlock('up')}
                        className="flex items-center justify-center w-full h-5 hover:bg-slate-100"
                    >
                        <ChevronUp size={12} />
                    </button>
                    <button
                        type="button"
                        title="Mover parágrafo (arrastar)"
                        onMouseDown={startBlockDrag}
                        className="flex items-center justify-center w-full h-9 hover:bg-slate-100 cursor-grab active:cursor-grabbing"
                    >
                        <GripVertical size={12} />
                    </button>
                    <button
                        type="button"
                        title="Mover para baixo"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => moveBlock('down')}
                        className="flex items-center justify-center w-full h-5 hover:bg-slate-100"
                    >
                        <ChevronDown size={12} />
                    </button>
                </div>
            )}
            {gripMenu && (
                <>
                    <div className="fixed inset-0 z-[110]" onMouseDown={() => setGripMenu(null)} />
                    <div
                        style={{ position: 'fixed', top: gripMenu.top, left: gripMenu.left, zIndex: 111 }}
                        className="w-48 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 text-sm text-slate-700"
                    >
                        {([
                            ['duplicate', 'Duplicar', Copy], ['delete', 'Eliminar', Trash2], ['__sep__', '', Copy],
                            ['h1', 'Título 1', Heading1], ['h2', 'Título 2', Heading2], ['h3', 'Título 3', Heading3],
                            ['p', 'Parágrafo', Pilcrow], ['p-quote', 'Citação', Quote],
                        ] as const).map(([action, label, Icon]) => action === '__sep__'
                            ? <div key="sep" className="my-1 h-px bg-slate-200" />
                            : (
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
            {htmlEdit !== null && htmlEditPos && (
                <div
                    style={{ position: 'fixed', top: htmlEditPos.top, left: htmlEditPos.left, width: Math.max(htmlEditPos.width, 420), zIndex: 200, visibility: htmlEditPos.visible ? 'visible' : 'hidden' }}
                >
                    <div className="relative">
                        <textarea
                            ref={htmlTextareaRef}
                            defaultValue={htmlEdit}
                            spellCheck={false}
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') endHtmlEdit();
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveHtmlEdit(htmlTextareaRef.current?.value ?? '');
                            }}
                            style={{ height: Math.min(Math.max(htmlEditPos.height + 40, 120), 600) }}
                            className="w-full font-mono text-sm leading-relaxed p-3 pr-16 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 outline-none shadow-xl resize-y"
                        />
                        <div className="absolute top-2 right-2 flex gap-1">
                            <button title="Cancelar" onMouseDown={(e) => e.preventDefault()} onClick={endHtmlEdit} className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 shadow-sm">
                                <X size={15} />
                            </button>
                            <button title="Guardar" onMouseDown={(e) => e.preventDefault()} onClick={() => saveHtmlEdit(htmlTextareaRef.current?.value ?? '')} className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-700 hover:bg-slate-800 text-white shadow-sm">
                                <Save size={15} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {dropLine && (
                <div
                    style={{ position: 'fixed', top: dropLine.top - 1, left: dropLine.left, width: dropLine.width, height: 2, background: '#475569', zIndex: 100, pointerEvents: 'none' }}
                />
            )}
        </>
    );
}
