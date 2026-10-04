import {
    Pilcrow, Heading1, Heading2, Heading3, Quote, Type,
    StickyNote, Image as ImageIcon, Copy, Trash2, Minus, BookMarked,
} from 'lucide-react';
import { MORE_STYLES_PARA, MORE_STYLES_HEAD } from '../config';

type Pos = { top: number; left: number };

// Único sítio que define esta forma — useBlockOverlays deriva o seu "internal" bag daqui
// via Omit (readOnly é o único que atravessa de fora). A edição de HTML inline vive à parte
// (HtmlEdit.tsx).
export interface BlockOverlaysProps {
    plusMenu: Pos | null;
    gripMenu: Pos | null;
    hrCtl: Pos | null;
    dropLine: { top: number; left: number; width: number } | null;
    styleMenu: { top: number; left: number; kind: 'para' | 'head' } | null;
    closePlusMenu: () => void;
    plusAction: (type: string) => void;
    setGripMenu: React.Dispatch<React.SetStateAction<Pos | null>>;
    gripAction: (action: string) => void;
    setHrWidth: (full: boolean) => void;
    deleteHr: () => void;
    styleAction: (format: string) => void;
    setStyleMenu: React.Dispatch<React.SetStateAction<{ top: number; left: number; kind: 'para' | 'head' } | null>>;
    readOnly?: boolean;
}

type Props = BlockOverlaysProps;

/** Overlays estilo Notion renderizados FORA do iframe (posição fixed em coords da viewport). */
export function BlockOverlays({
    plusMenu, gripMenu, hrCtl, dropLine, closePlusMenu, plusAction,
    setGripMenu, gripAction, setHrWidth, deleteHr,
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
            {dropLine && (
                <div
                    style={{ position: 'fixed', top: dropLine.top - 1, left: dropLine.left, width: dropLine.width, height: 2, background: '#475569', zIndex: 100, pointerEvents: 'none' }}
                />
            )}
        </>
    );
}
