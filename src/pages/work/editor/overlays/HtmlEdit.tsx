import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Save, Replace } from 'lucide-react';
import type { TinyMCEEditor } from '../types';
import { countInBook, replaceInBook } from '../book-find-replace';
import { editBlocks } from '../blockEdit';
import { useNotification } from '../../../../context/NotificationContext';

/**
 * Edição de HTML inline de um bloco de topo: esconde o bloco (data-mce-htmledit) e mostra um
 * textarea no lugar, na mesma caixa, com um mini procurar/substituir no documento (o único
 * sítio onde se vê/edita HTML em bruto). Estado, posição e vista vivem aqui; o resto do
 * editor só o abre (`start`) e o liga aos eventos (`reposition` no scroll, `close` ao clicar
 * no editor).
 */
export interface HtmlEdit {
    element: React.ReactNode;
    start: (top: HTMLElement) => void;
    isOpen: () => boolean;
    reposition: () => void;
    close: () => void;
}

export interface HtmlEditOptions {
    activeChapterIndex: number;
    // Substituição em todo o LIVRO mesmo com só um capítulo carregado no editor — sem isto
    // (activeChapterIndex !== -1), o find/replace só alcança o texto que está na DOM.
    onCountInWholeBook: (find: string) => number;
    onReplaceInWholeBook: (find: string, replaceWith: string) => number;
    wholeBookLoaded: boolean;
    chapterLabel: string;
}

type Box = { top: number; left: number; width: number; height: number; maxHeight: number; visible: boolean };

const iframeOf = (editor: TinyMCEEditor) =>
    (editor.getContainer()?.querySelector('iframe') as HTMLIFrameElement | null);

// A caixa (position:fixed, z-index alto) pintava por cima da toolbar sticky e da statusbar do
// TinyMCE (sem z-index próprio, só ordem no DOM). Em vez de uma guerra de z-index com o skin,
// limita-se ao espaço ENTRE as duas: nunca acima do fundo da toolbar nem abaixo da statusbar.
const GAP = 8;
function chromeBounds(editor: TinyMCEEditor): { minTop: number; maxBottom: number } {
    const container = editor.getContainer() as HTMLElement | null;
    const header = container?.querySelector('.tox-editor-header') as HTMLElement | null;
    const statusbar = container?.querySelector('.tox-statusbar') as HTMLElement | null;
    const minTop = header ? header.getBoundingClientRect().bottom + GAP : 0;
    const maxBottom = statusbar ? statusbar.getBoundingClientRect().top - GAP : window.innerHeight;
    return { minTop, maxBottom };
}

// Painel "Substituir" sempre abaixo da toolbar (top-11) cortava-se na última linha do
// capítulo: sem espaço a seguir aos 44px da toolbar, abre para cima. ~260px = painel cheio.
const REPLACE_PANEL_HEIGHT = 260;

export function useHtmlEdit(editorRef: React.MutableRefObject<TinyMCEEditor | null>, options: HtmlEditOptions): HtmlEdit {
    const { activeChapterIndex, onCountInWholeBook, onReplaceInWholeBook, wholeBookLoaded, chapterLabel } = options;
    const { showNotification } = useNotification();
    const blockRef = useRef<HTMLElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [html, setHtml] = useState<string | null>(null);
    const [box, setBox] = useState<Box | null>(null);

    // Procurar/substituir. Âmbito escolhido pelo utilizador — nem sempre o que está carregado
    // (wholeBookLoaded): "Documento" a partir de um capítulo alcança o livro inteiro por fora do
    // editor; "Capítulo" a partir do Documento Completo isola só o segmento do bloco aberto.
    const [replaceOpen, setReplaceOpen] = useState(false);
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [matchCount, setMatchCount] = useState<number | null>(null);
    const [docScope, setDocScope] = useState<'chapter' | 'document'>('chapter');
    const resetReplace = () => { setReplaceOpen(false); setFindText(''); setReplaceText(''); setMatchCount(null); };

    const measure = (editor: TinyMCEEditor, block: HTMLElement, visibleCheck: boolean): Box | null => {
        const iframe = iframeOf(editor);
        if (!iframe) return null;
        const ir = iframe.getBoundingClientRect(); const r = block.getBoundingClientRect();
        const { minTop, maxBottom } = chromeBounds(editor);
        const top = Math.max(ir.top + r.top, minTop);
        // fora da área visível do editor → esconder sem desmontar (preserva o texto escrito)
        const visible = !visibleCheck || (r.bottom > 0 && r.top < ir.height && top >= 0 && top < window.innerHeight);
        return { top, left: ir.left + r.left, width: r.width, height: r.height, maxHeight: Math.max(maxBottom - top, 120), visible };
    };

    // Ponto único de fecho (clique fora, Cancelar, Guardar, Substituir) — inclui o reset do painel.
    const close = () => {
        const block = blockRef.current;
        if (block) editorRef.current?.dom.setAttrib(block, 'data-mce-htmledit', null); // volta a mostrar o texto
        blockRef.current = null; setHtml(null); setBox(null);
        resetReplace();
    };
    const start = (top: HTMLElement) => {
        const editor = editorRef.current;
        if (!editor) return;
        blockRef.current = top;
        setHtml(editor.dom.getOuterHTML(top).replace(/\s*data-mce-[\w-]+="[^"]*"/g, ''));
        editor.dom.setAttrib(top, 'data-mce-htmledit', '1');
        setBox(measure(editor, top, false));
    };
    const reposition = () => {
        const editor = editorRef.current; const block = blockRef.current;
        if (!editor || !block) return;
        const next = measure(editor, block, true);
        if (next) setBox(next);
    };
    const save = (value: string) => {
        const editor = editorRef.current; const block = blockRef.current;
        close();
        if (!editor || !block || !block.parentNode) return;
        editBlocks(editor, () => {
            editor.dom.setOuterHTML(block, value);
            editor.focus();
        });
    };

    // useCallback: identidade estável entre renders — sem isto o efeito de contagem (debounced)
    // reiniciava o temporizador a cada re-render do editor com o painel aberto.
    const countInDocument = useCallback((find: string, scope: 'chapter' | 'document'): number =>
        countInBook(editorRef.current, activeChapterIndex, onCountInWholeBook, find, scope),
        [activeChapterIndex, onCountInWholeBook, editorRef]);
    const replaceInDocument = (find: string, replaceWith: string, scope: 'chapter' | 'document'): number =>
        replaceInBook(editorRef.current, activeChapterIndex, onReplaceInWholeBook, blockRef.current, find, replaceWith, scope);

    // Contagem ao vivo (debounced — getContent() serializa o documento inteiro) para ver quantas
    // ocorrências há ANTES de aplicar. Só com o painel aberto + texto; um matchCount desatualizado
    // nunca aparece (só é mostrado com findText).
    useEffect(() => {
        if (!replaceOpen || !findText) return;
        const t = setTimeout(() => setMatchCount(countInDocument(findText, docScope)), 150);
        return () => clearTimeout(t);
    }, [replaceOpen, findText, docScope, countInDocument]);

    const openReplace = () => {
        if (!replaceOpen) {
            setDocScope(wholeBookLoaded ? 'document' : 'chapter');
            const ta = textareaRef.current;
            if (ta && ta.selectionStart !== ta.selectionEnd) setFindText(ta.value.slice(ta.selectionStart, ta.selectionEnd));
        }
        setReplaceOpen(o => !o);
    };
    const applyReplace = () => {
        if (!findText) return;
        const count = replaceInDocument(findText, replaceText, docScope);
        if (count === 0) { showNotification('error', 'Sem ocorrências encontradas.'); return; }
        showNotification('success', `${count} ${count === 1 ? 'substituição feita' : 'substituições feitas'}.`, 2500);
        close(); // o documento foi reescrito — a caixa deste bloco já não é fiável
    };
    const confirmSave = () => save(textareaRef.current?.value ?? '');

    const replaceOpensAbove = !!box && box.maxHeight - 44 < REPLACE_PANEL_HEIGHT;
    const element = html !== null && box && (
        <div style={{ position: 'fixed', top: box.top, left: box.left, width: Math.max(box.width, 420), zIndex: 200, visibility: box.visible ? 'visible' : 'hidden' }}>
            <div className="relative">
                <textarea
                    ref={textareaRef}
                    defaultValue={html}
                    spellCheck={false}
                    autoFocus
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') close();
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) confirmSave();
                    }}
                    style={{ height: Math.min(Math.max(box.height + 40, 120), 600, box.maxHeight) }}
                    className="w-full font-mono text-sm leading-relaxed p-3 pr-24 rounded-lg border border-slate-300 bg-slate-50 text-slate-700 outline-none shadow-xl resize-y"
                />
                <div className="absolute top-2 right-2 flex gap-1">
                    <button title="Substituir" onMouseDown={(e) => e.preventDefault()} onClick={openReplace} className={`flex items-center justify-center w-7 h-7 rounded-md border shadow-sm ${replaceOpen ? 'bg-slate-700 text-white border-slate-700' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'}`}>
                        <Replace size={15} />
                    </button>
                    <button title="Cancelar" onMouseDown={(e) => e.preventDefault()} onClick={close} className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 shadow-sm">
                        <X size={15} />
                    </button>
                    <button title="Guardar" onMouseDown={(e) => e.preventDefault()} onClick={confirmSave} className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-700 hover:bg-slate-800 text-white shadow-sm">
                        <Save size={15} />
                    </button>
                </div>
                {replaceOpen && (
                    <div className={`absolute right-2 z-10 w-64 p-2.5 rounded-lg border border-slate-300 bg-white shadow-xl flex flex-col gap-1.5 ${replaceOpensAbove ? 'bottom-full mb-2' : 'top-11'}`}>
                        <div className="flex gap-1">
                            {([['document', 'Documento'], ['chapter', chapterLabel]] as const).map(([scope, label]) => (
                                <button
                                    key={scope}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setDocScope(scope)}
                                    title={scope === 'chapter' ? chapterLabel : undefined}
                                    className={`flex-1 min-w-0 truncate px-2 py-1 rounded text-xs font-medium transition-colors ${docScope === scope ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            placeholder="Procurar"
                            value={findText}
                            autoFocus
                            onChange={(e) => setFindText(e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => { if (e.key === 'Enter') applyReplace(); }}
                            className="w-full px-2 py-1.5 text-sm rounded-md border border-slate-300 outline-none focus:border-slate-500"
                        />
                        {findText && (
                            <div className="text-xs px-0.5 -mt-0.5 text-slate-400">
                                {matchCount === null ? 'a contar…' : matchCount === 0 ? 'sem ocorrências' : `${matchCount} ocorrência${matchCount === 1 ? '' : 's'}`}
                            </div>
                        )}
                        <input
                            type="text"
                            placeholder="Substituir por"
                            value={replaceText}
                            onChange={(e) => setReplaceText(e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => { if (e.key === 'Enter') applyReplace(); }}
                            className="w-full px-2 py-1.5 text-sm rounded-md border border-slate-300 outline-none focus:border-slate-500"
                        />
                        <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={applyReplace}
                            disabled={!findText || matchCount === 0}
                            className="mt-0.5 w-full py-1.5 rounded-md bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-50"
                        >
                            Substituir tudo
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    return { element, start, isOpen: () => blockRef.current !== null, reposition, close };
}
