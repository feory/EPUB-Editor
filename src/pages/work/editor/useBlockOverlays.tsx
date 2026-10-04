import { useCallback, useEffect, useRef, useState } from 'react';
import type { TinyMCEEditor } from './types';
import { countInBook, replaceInBook } from './book-find-replace';
import { BlockOverlays, type BlockOverlaysProps } from './overlays/BlockOverlays';
import { attachMiniMenu, type MiniMenu } from './miniMenu';

// As únicas 3 que atravessam para fora do subsistema (WorkEditor/setup.ts); tudo o resto em
// BlockOverlaysProps só alimenta o render interno — ver useBlockOverlays() no fim do ficheiro.
type BlockOverlaysInternal = Omit<BlockOverlaysProps, 'readOnly' | 'wholeBookLoaded' | 'chapterLabel'>;

const noop0 = () => 0;

type Pos = { top: number; left: number };

// iframe do editor (dentro do container); todas as posições de overlay derivam do seu rect.
const iframeOf = (editor: TinyMCEEditor) =>
    (editor.getContainer()?.querySelector('iframe') as HTMLIFrameElement | null);

// A caixa de editar HTML (position:fixed, z-index alto — ver BlockOverlays.tsx) pintava por
// cima da toolbar sticky e da statusbar do TinyMCE (nenhuma das duas tem z-index próprio, só
// stacking por ordem no DOM — a nossa caixa vem depois no DOM e ganha sempre). Em vez de entrar
// numa guerra de z-index com o skin do TinyMCE, limita-se a própria caixa ao espaço ENTRE as
// duas: nunca começa acima do fundo da toolbar, nunca cresce para lá do topo da statusbar.
const GAP = 8;
function chromeBounds(editor: TinyMCEEditor): { minTop: number; maxBottom: number } {
    const container = editor.getContainer() as HTMLElement | null;
    const header = container?.querySelector('.tox-editor-header') as HTMLElement | null;
    const statusbar = container?.querySelector('.tox-statusbar') as HTMLElement | null;
    const minTop = header ? header.getBoundingClientRect().bottom + GAP : 0;
    const maxBottom = statusbar ? statusbar.getBoundingClientRect().top - GAP : window.innerHeight;
    return { minTop, maxBottom };
}

export interface BlockOverlaysOptions {
    activeChapterIndex: number;
    // Substituição em todo o LIVRO mesmo com só um capítulo carregado no editor — sem isto
    // (activeChapterIndex !== -1), o find/replace só alcança o texto que está na DOM.
    onCountInWholeBook?: (find: string) => number;
    onReplaceInWholeBook?: (find: string, replaceWith: string) => number;
    readOnly?: boolean;
    wholeBookLoaded: boolean;
    chapterLabel: string;
}

/**
 * Subsistema de overlays estilo Notion (fora do iframe): botão "+", pega de arrastar,
 * menu de inserção, menu da pega, controlo de divisória e edição de HTML inline.
 * Detém todo o estado/refs/handlers; devolve uma interface pequena — `render` (o próprio
 * overlay, pronto a montar), `mount` (liga a lógica ao editor) e os dois pontos de entrada
 * que o resto do WorkEditor precisa de acionar de fora (mini-menu → editar HTML / mais estilos).
 * Tudo o resto (20+ campos de estado/handlers) fica interno — só BlockOverlays.tsx os usa.
 */
export function useBlockOverlays(editorRef: React.MutableRefObject<TinyMCEEditor | null>, options: BlockOverlaysOptions) {
    const { activeChapterIndex, onCountInWholeBook = noop0, onReplaceInWholeBook = noop0, readOnly, wholeBookLoaded, chapterLabel } = options;
    // Pega de arrastar (gutter esquerdo): visível enquanto o bloco está ativo (selecionado), independente do rato.
    const [gripPos, setGripPos] = useState<Pos | null>(null);
    const [gripFading, setGripFading] = useState(false); // fade-out suave durante o scroll
    const gripPosRef = useRef<Pos | null>(null);
    const gripBlockRef = useRef<HTMLElement | null>(null);
    // Mini-menu (miniMenu.ts): o único que mexe no pop; aqui só se pede para o esconder.
    const miniMenuRef = useRef<MiniMenu | null>(null);
    // Pega a desmontar com o rato em cima (sem mouseleave) não pode deixar o mini-menu preso.
    const clearGrip = () => { miniMenuRef.current?.suppress('grip', false); gripPosRef.current = null; gripBlockRef.current = null; setGripFading(false); setGripPos(null); };
    const [gripMenu, setGripMenu] = useState<Pos | null>(null); // menu ao clicar na pega
    // "Mais estilos" (mini-menu ⋮): overlay React em 2 colunas, ancorado ao pop do mini-menu.
    const [styleMenu, setStyleMenu] = useState<{ top: number; left: number; kind: 'para' | 'head' } | null>(null);
    // Impede o clique no próprio ⋮ de reabrir o menu logo a seguir ao mousedown o ter fechado.
    const styleMenuGuardRef = useRef(0);
    const openStyleMenu = (kind: 'para' | 'head') => {
        if (Date.now() < styleMenuGuardRef.current) return; // acabou de fechar (2º clique no ⋮) → não reabrir
        const pop = document.querySelector('.tox-tinymce-aux .tox-pop') as HTMLElement | null;
        const r = pop?.getBoundingClientRect();
        setStyleMenu({ top: r ? r.bottom + 4 : 120, left: r ? r.left : 120, kind });
    };
    // Fechar ao clicar fora do menu (⋮ novamente, outro botão do mini-menu, ou qualquer sítio).
    // Listener global porque o pop do mini-menu (TinyMCE aux) fica acima de um backdrop React.
    useEffect(() => {
        if (!styleMenu) return;
        const onDown = (e: MouseEvent) => {
            if ((e.target as HTMLElement).closest?.('[data-style-menu]')) return; // clique dentro do menu
            setStyleMenu(null);
            styleMenuGuardRef.current = Date.now() + 300; // click do ⋮ que se segue não reabre
        };
        document.addEventListener('mousedown', onDown, true);
        return () => document.removeEventListener('mousedown', onDown, true);
    }, [styleMenu]);
    const styleAction = (format: string) => {
        setStyleMenu(null);
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        // Estilos de parágrafo (p-bold, p-indent, ...) são formatos de SELECTOR ('p,li') — não
        // casam num bloco ainda h1/h2/h3, por isso o toggle não fazia nada (só "Padrão" convertia
        // a tag). Ao vir de um título, converte primeiro para <p> antes de aplicar a classe.
        // transact: formatter.toggle sozinho não cria passo de undo (Ctrl+Z não o revertia).
        editor.undoManager.transact(() => {
            if (!/^(h1|h2|h3|p)$/.test(format)) {
                const block = editor.selection.getNode()?.closest?.('h1,h2,h3');
                if (block) editor.execCommand('FormatBlock', false, 'p');
            }
            editor.formatter.toggle(format); // h1-3 sincroniza o marcador de capítulo via FormatApply/FormatRemove
        });
        editor.dispatch('Change');
        editor.nodeChanged();
    };
    // Controlo de largura da divisória ao passar o rato sobre um <hr>.
    const [hrCtl, setHrCtl] = useState<Pos | null>(null);
    const hrRef = useRef<HTMLElement | null>(null);
    const setHrWidth = (full: boolean) => {
        const editor = editorRef.current; const hr = hrRef.current;
        if (!editor || !hr) return;
        editor.undoManager.transact(() => {
            if (full) editor.dom.addClass(hr, 'divider-full'); else editor.dom.removeClass(hr, 'divider-full');
        });
        editor.dispatch('Change');
        // reposicionar o controlo (a largura mudou)
        const iframe = iframeOf(editor);
        if (iframe) { const ir = iframe.getBoundingClientRect(); const r = hr.getBoundingClientRect();
            setHrCtl({ top: ir.top + r.top + r.height / 2, left: ir.left + r.left + r.width / 2 }); }
    };
    const deleteHr = () => {
        const editor = editorRef.current; const hr = hrRef.current;
        if (!editor || !hr) return;
        editor.dom.remove(hr);
        hrRef.current = null; setHrCtl(null);
        editor.focus();
        editor.dispatch('Change');
        editor.nodeChanged();
    };

    // Editar HTML do bloco (linha) INLINE: esconde o bloco e mostra um textarea no lugar (mesma caixa).
    const htmlBlockRef = useRef<HTMLElement | null>(null);
    const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);
    const [htmlEdit, setHtmlEdit] = useState<string | null>(null);
    const [htmlEditPos, setHtmlEditPos] = useState<{ top: number; left: number; width: number; height: number; maxHeight: number; visible: boolean } | null>(null);
    const repositionHtmlEdit = () => {
        const editor = editorRef.current; const block = htmlBlockRef.current;
        if (!editor || !block) return;
        const iframe = iframeOf(editor);
        if (!iframe) return;
        const ir = iframe.getBoundingClientRect(); const r = block.getBoundingClientRect();
        const { minTop, maxBottom } = chromeBounds(editor);
        const top = Math.max(ir.top + r.top, minTop);
        // esconder (sem desmontar → preserva o texto) quando o bloco sai da área visível do editor
        const visible = r.bottom > 0 && r.top < ir.height && top >= 0 && top < window.innerHeight;
        setHtmlEditPos({ top, left: ir.left + r.left, width: r.width, height: r.height, maxHeight: Math.max(maxBottom - top, 120), visible });
    };
    // Painel "Substituir" (estado local a BlockOverlays.tsx, ver findText/replaceOpen ali)
    // regista aqui o próprio reset — por ref, atualizado a cada render (sem efeito) — para que
    // endHtmlEdit, ponto único de fecho da caixa (clique fora, Cancelar, Guardar, Substituir),
    // o dispare sempre. Sem isto, fechar a caixa por CLIQUE NOUTRO PARÁGRAFO (mousedown abaixo,
    // único caminho que não passa por BlockOverlays.tsx) deixava o painel arrastar findText/
    // replaceOpen de um parágrafo para o seguinte.
    const onHtmlEditCloseRef = useRef<(() => void) | null>(null);
    const endHtmlEdit = () => {
        const block = htmlBlockRef.current;
        if (block) editorRef.current?.dom.setAttrib(block, 'data-mce-htmledit', null); // volta a mostrar o texto
        htmlBlockRef.current = null; setHtmlEdit(null); setHtmlEditPos(null);
        onHtmlEditCloseRef.current?.();
    };
    // Abrir a edição de HTML inline para um elemento de topo (usado pela pega e pelo mini-menu).
    const startHtmlEdit = (top: HTMLElement) => {
        const editor = editorRef.current;
        if (!editor) return;
        htmlBlockRef.current = top;
        const clean = editor.dom.getOuterHTML(top).replace(/\s*data-mce-[\w-]+="[^"]*"/g, '');
        setHtmlEdit(clean);
        editor.dom.setAttrib(top, 'data-mce-htmledit', '1');
        const iframe = iframeOf(editor);
        if (iframe) {
            const ir = iframe.getBoundingClientRect(); const r = top.getBoundingClientRect();
            const { minTop, maxBottom } = chromeBounds(editor);
            const boxTop = Math.max(ir.top + r.top, minTop);
            setHtmlEditPos({ top: boxTop, left: ir.left + r.left, width: r.width, height: r.height, maxHeight: Math.max(maxBottom - boxTop, 120), visible: true });
        }
    };
    const saveHtmlEdit = (html: string) => {
        const editor = editorRef.current; const block = htmlBlockRef.current;
        endHtmlEdit();
        if (!editor || !block || !block.parentNode) return;
        editor.dom.setOuterHTML(block, html);
        editor.focus();
        editor.dispatch('Change');
        editor.nodeChanged();
    };

    // Contagem/substituição do mini find/replace da caixa de edição de HTML (BlockOverlays) —
    // lógica de âmbito (documento/capítulo, isolar segmento, delegar p/ livro inteiro fora da
    // DOM) vive em book-find-replace.ts. useCallback: identidade estável entre renders
    // (gripPos muda a cada mousemove no editor) — sem isto, o useEffect de contagem
    // debounced em BlockOverlays reiniciava o temporizador a cada movimento do rato com o
    // painel aberto.
    const countInDocument = useCallback((find: string, scope: 'chapter' | 'document'): number =>
        countInBook(editorRef.current, activeChapterIndex, onCountInWholeBook, find, scope),
        [activeChapterIndex, onCountInWholeBook, editorRef]);

    const replaceInDocument = useCallback((find: string, replaceWith: string, scope: 'chapter' | 'document'): number =>
        replaceInBook(editorRef.current, activeChapterIndex, onReplaceInWholeBook, htmlBlockRef.current, find, replaceWith, scope),
        [activeChapterIndex, onReplaceInWholeBook, editorRef]);

    // Mover o bloco de topo uma posição para cima/baixo (setas na pega).
    const moveBlock = (dir: 'up' | 'down') => {
        const editor = editorRef.current;
        const block = gripBlockRef.current;
        if (!editor || !block) return;
        const body = editor.getBody();
        let top = block;
        while (top.parentElement && top.parentElement !== body) top = top.parentElement;
        const sib = (dir === 'up' ? top.previousElementSibling : top.nextElementSibling) as HTMLElement | null;
        if (!sib || !top.parentNode) return;
        top.parentNode.insertBefore(top, dir === 'up' ? sib : sib.nextSibling);
        editor.selection.select(block); editor.selection.collapse(true);
        editor.focus();
        editor.dispatch('Change');
        editor.nodeChanged(); // reavaliar posição da pega no novo sítio
    };

    // Ações do menu da pega sobre o bloco ativo (formato) ou o bloco de topo (duplicar/eliminar).
    const gripAction = (action: string) => {
        setGripMenu(null);
        const editor = editorRef.current;
        const block = gripBlockRef.current;
        if (!editor || !block) return;
        const body = editor.getBody();
        let top = block;
        while (top.parentElement && top.parentElement !== body) top = top.parentElement;
        editor.undoManager.transact(() => { // escritas diretas/formatter: sem isto, sem passo de undo
            if (action === 'duplicate') {
                top.parentNode?.insertBefore(top.cloneNode(true), top.nextSibling);
            } else if (action === 'delete') {
                top.remove();
            } else {
                editor.selection.select(block); editor.selection.collapse(true);
                if (/^h[123]$/.test(action) || action === 'p') editor.execCommand('FormatBlock', false, action);
                else editor.formatter.apply(action);
            }
        });
        editor.focus();
        editor.dispatch('Change');
        editor.nodeChanged();
    };

    // Botão "+" → abre um menu de inserção; escolher insere um novo bloco a seguir ao bloco-âncora.
    const [plusMenu, setPlusMenu] = useState<Pos | null>(null);
    const plusMenuOpenRef = useRef(false); // menu aberto → pega/mini-menu escondidos
    const plusBlockRef = useRef<HTMLElement | null>(null); // bloco-âncora do menu
    const closePlusMenu = () => {
        plusMenuOpenRef.current = false;
        miniMenuRef.current?.suppress('plusMenu', false);
        plusBlockRef.current?.removeAttribute('data-mce-plusopen');
        setPlusMenu(null);
        editorRef.current?.nodeChanged(); // reavalia mini-menu + grip (voltam a aparecer)
    };
    // Chamado pelo clique no "+" (CSS ::after do bloco, ver contentStyles.ts); pos em coords da viewport.
    const openPlusMenu = (block: HTMLElement, pos: Pos) => {
        plusMenuOpenRef.current = true;
        plusBlockRef.current = block;
        block.setAttribute('data-mce-plusopen', '1'); // mantém o "+" visível sem :hover (rato vai para o menu)
        clearGrip(); // esconder a pega enquanto o menu está aberto
        miniMenuRef.current?.suppress('plusMenu', true);
        setPlusMenu(pos); // acima do "+"
    };
    const plusAction = (type: string) => {
        closePlusMenu();
        const editor = editorRef.current;
        const block = plusBlockRef.current;
        if (!editor || !block || !block.parentNode) return;
        if (type === 'hr') { // divisória: só o <hr> (sem parágrafo extra)
            const hr = editor.dom.create('hr', {});
            block.parentNode.insertBefore(hr, block.nextSibling);
            const after = hr.nextSibling as HTMLElement | null;
            if (after && /^(P|H[1-6])$/.test(after.nodeName)) editor.selection.setCursorLocation(after, 0);
            else { editor.selection.select(block); editor.selection.collapse(false); }
            editor.focus();
            editor.dispatch('Change');
            editor.nodeChanged();
            return;
        }
        if (type === 'chapterbreak') { // marcador+conteúdo próprios, ver comando mceChapterBreak
            editor.selection.select(block);
            editor.selection.collapse(false);
            editor.execCommand('mceChapterBreak');
            return;
        }
        const parent = block.parentNode;
        editor.undoManager.transact(() => { // bloco novo + estilo = um passo de undo
            const p = editor.dom.create('p', {}, '<br data-mce-bogus="1">');
            parent.insertBefore(p, block.nextSibling);
            editor.selection.setCursorLocation(p, 0);
            editor.focus();
            // Reusa comandos/formats existentes (FormatBlock h1-3 dispara syncChapterMarker).
            if (/^h[123]$/.test(type)) editor.execCommand('FormatBlock', false, type);
            else if (type !== 'p' && type !== 'image') editor.formatter.apply(type);
        });
        if (type === 'image') editor.execCommand('mceImage'); // abre diálogo: fora do transact
        editor.dispatch('Change');
        editor.nodeChanged();
    };

    // Arrastar o bloco ativo para outro sítio (pega estilo Notion).
    const dragBlockRef = useRef<HTMLElement | null>(null);
    // Rato em cima da pega → mini-menu escondido. A arrastar, sair da pega não o repõe: só o
    // fim do arrasto (onUp).
    const onGripEnter = () => miniMenuRef.current?.suppress('grip', true);
    const onGripLeave = () => { if (!dragBlockRef.current) miniMenuRef.current?.suppress('grip', false); };
    const dropTargetRef = useRef<{ block: HTMLElement; pos: 'before' | 'after' } | null>(null);
    const [dropLine, setDropLine] = useState<{ top: number; left: number; width: number } | null>(null);
    const startBlockDrag = (e: React.MouseEvent) => {
        e.preventDefault();
        const editor = editorRef.current;
        const block = gripBlockRef.current;
        if (!editor || !block) return;
        const iframe = iframeOf(editor);
        if (!iframe) return;
        const body = editor.getBody();
        // Arrastar o bloco de TOPO (filho direto do body) — insertBefore no body fica sempre válido,
        // mesmo que o bloco ativo esteja aninhado (ex. dentro de div.box).
        let top = block;
        while (top.parentElement && top.parentElement !== body) top = top.parentElement;
        dragBlockRef.current = top;
        const startX = e.clientX, startY = e.clientY;
        let moved = false;
        document.body.style.userSelect = 'none';
        const onMove = (ev: MouseEvent) => {
            if (!moved) {
                if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
                moved = true;
                iframe.style.pointerEvents = 'none'; // só ao arrastar: eventos passam ao doc pai (senão o iframe engole-os)
            }
            const ir = iframe.getBoundingClientRect();
            const y = ev.clientY - ir.top; // coords do iframe
            const blocks = (Array.from(body.children) as HTMLElement[]).filter((b) => b !== dragBlockRef.current);
            if (!blocks.length) { dropTargetRef.current = null; setDropLine(null); return; }
            let target = blocks[0]; let pos: 'before' | 'after' = 'before';
            for (const b of blocks) {
                const r = b.getBoundingClientRect();
                if (y < (r.top + r.bottom) / 2) { target = b; pos = 'before'; break; }
                target = b; pos = 'after';
            }
            dropTargetRef.current = { block: target, pos };
            const r = target.getBoundingClientRect();
            setDropLine({ top: ir.top + (pos === 'before' ? r.top : r.bottom), left: ir.left + r.left, width: r.width });
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            iframe.style.pointerEvents = '';
            document.body.style.userSelect = '';
            setDropLine(null);
            if (!moved) { setGripMenu({ top: startY, left: startX + 14 }); return; } // clique → menu
            const drag = dragBlockRef.current;
            const tgt = dropTargetRef.current;
            dragBlockRef.current = null; dropTargetRef.current = null;
            miniMenuRef.current?.suppress('grip', false); // ver onGripLeave
            if (drag && tgt && tgt.block !== drag && drag.parentNode) {
                const ref = tgt.pos === 'before' ? tgt.block : tgt.block.nextSibling;
                if (ref !== drag) {
                    drag.parentNode.insertBefore(drag, ref);
                    editor.selection.select(drag); editor.selection.collapse(true);
                    editor.focus();
                    editor.dispatch('Change');
                    editor.nodeChanged(); // reavaliar posição da pega/"+" no novo sítio
                }
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    // Instala a reação ao editor (chamado pelo setup, depois de definir blockOf/hiddenBlock).
    const wireEditor = (
        editor: TinyMCEEditor,
        { blockOf, getHiddenBlock }: { blockOf: (n: Node | null) => Element | null; getHiddenBlock: () => Element | null },
    ) => {
        const isPlusBlock = (block: HTMLElement | null): block is HTMLElement =>
            !!block && block !== editor.getBody() && /^(P|H[1-6])$/.test(block.nodeName)
            && !/\bchapter-break/.test(block.className);
        miniMenuRef.current = attachMiniMenu(editor, { blockOf });
        let lastMouseY = -1; // Y do rato em coords do iframe (-1 = desconhecido)
        let lastMouseX = -1; // X do rato em coords do iframe
        // Zona à esquerda da aresta do bloco onde a pega aparece.
        const GRIP_BAND = 36;
        editor.on('mousemove', (e: MouseEvent) => { lastMouseX = e.clientX; lastMouseY = e.clientY; evalGrip(); });
        // Botão "+": desenhado só em CSS (::after do bloco sob o rato, ver contentStyles.ts).
        // Pseudo-elementos não recebem eventos → o clique chega ao próprio bloco e é reconhecido
        // pela posição (círculo de 20px centrado na borda inferior).
        editor.on('PreInit', () => editor.serializer.addTempAttr('data-mce-plusopen'));
        // Centro do círculo = fim do conteúdo + --plus-dy (mesma conta do CSS).
        const plusCenterY = (block: HTMLElement) => {
            const cs = getComputedStyle(block);
            return block.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom) + (parseFloat(cs.getPropertyValue('--plus-dy')) || 0);
        };
        // O 'click' que se segue ao mousedown no "+" contaria como "2.º clique no mesmo bloco"
        // (setup.ts → hiddenBlock) e tirava o anel ao parágrafo; engolido antes de lá chegar.
        let swallowClick = false;
        editor.on('click', (e: MouseEvent) => {
            if (!swallowClick) return;
            swallowClick = false;
            e.stopImmediatePropagation();
        }, true);
        editor.on('mousedown', (e: MouseEvent) => {
            swallowClick = false;
            const block = e.target as HTMLElement;
            if (e.button !== 0 || editor.mode.isReadOnly() || block.parentNode !== editor.getBody() || !isPlusBlock(block)) return;
            const br = block.getBoundingClientRect();
            if (Math.abs(e.clientX - (br.left + br.width / 2)) > 11 || Math.abs(e.clientY - plusCenterY(block)) > 11) return;
            // Com outro bloco ativo o "+" deste está escondido (CSS) → clique normal.
            const active = editor.getBody().querySelector('[data-mce-psactive]');
            if (active && active !== block) return;
            const iframe = iframeOf(editor);
            if (!iframe) return;
            e.preventDefault(); // não deixar o browser mover o cursor nem tirar o foco
            swallowClick = true;
            // O parágrafo do "+" fica (ou passa a ser) o bloco ativo, com anel, enquanto o menu está aberto.
            if (blockOf(editor.selection.getNode()) !== block) {
                editor.selection.select(block, true);
                editor.selection.collapse(false);
            }
            editor.focus();
            editor.nodeChanged(); // síncrono: aplica data-mce-psactive → --plus-dy já conta abaixo
            const ir = iframe.getBoundingClientRect();
            openPlusMenu(block, { top: ir.top + plusCenterY(block) - 10, left: ir.left + br.left + br.width / 2 });
        });
        // Hover sobre uma divisória → controlo Pequena/Larga.
        editor.on('mousemove', (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t && t.nodeName === 'HR') {
                if (hrRef.current === t) return; // já mostrado p/ este hr
                const iframe = iframeOf(editor);
                if (!iframe) return;
                const ir = iframe.getBoundingClientRect();
                const r = t.getBoundingClientRect();
                hrRef.current = t;
                setHrCtl({ top: ir.top + r.top + r.height / 2, left: ir.left + r.left + r.width / 2 });
            } else if (hrRef.current) { hrRef.current = null; setHrCtl(null); }
        });

        // Pega de arrastar no gutter esquerdo — visível quando o rato está no limite esquerdo do bloco ATIVO.
        // Esconde com fade-out (opacidade → 0, depois desmonta) para um desaparecimento suave.
        let gripHideTimer: ReturnType<typeof setTimeout> | null = null;
        const cancelGripHide = () => { if (gripHideTimer) { clearTimeout(gripHideTimer); gripHideTimer = null; } };
        const fadeOutGrip = () => {
            if (!gripPosRef.current) return;      // nada montado
            setGripFading(true);
            if (gripHideTimer) return;            // já a desaparecer
            // desmontar só DEPOIS de a transição de opacidade (300ms) terminar → sem salto
            gripHideTimer = setTimeout(() => { gripHideTimer = null; clearGrip(); }, 340);
        };
        const evalGrip = () => {
            if (plusMenuOpenRef.current) { fadeOutGrip(); return; } // menu de inserção aberto → sem pega
            if (!editor.hasFocus()) { fadeOutGrip(); return; }
            const block = blockOf(editor.selection.getNode()) as HTMLElement | null;
            if (!isPlusBlock(block) || block === getHiddenBlock()) { fadeOutGrip(); return; }
            const iframe = iframeOf(editor);
            if (!iframe) { fadeOutGrip(); return; }
            const ir = iframe.getBoundingClientRect();
            const br = block.getBoundingClientRect();
            const midY = br.top + br.height / 2;
            if (midY < 0 || midY > ir.height) { fadeOutGrip(); return; } // fora do visível
            // Só com o rato no limite esquerdo do bloco (gutter) e à altura do bloco.
            if (lastMouseX < br.left - GRIP_BAND || lastMouseX > br.left + 12) { fadeOutGrip(); return; }
            if (lastMouseY < br.top - 4 || lastMouseY > br.bottom + 4) { fadeOutGrip(); return; }
            // Pilha da pega ≈ 76px (h-5 + h-9 + h-5); topo = meio - 38 → centrada sem translate
            // (translateY colidiria com a animação plusPop, causando um salto vertical).
            const posTop = ir.top + midY - 38;
            if (posTop < 0 || posTop > window.innerHeight) { fadeOutGrip(); return; } // clamp à janela
            cancelGripHide(); // rato de volta ao gutter → cancelar o fade pendente
            gripBlockRef.current = block;
            // Linha da borda ≈ 4px à esquerda do bloco; centrar a pega (20px) nessa linha.
            const pos = { top: posTop, left: ir.left + br.left - 14 };
            const prev = gripPosRef.current;
            if (prev && Math.abs(prev.top - pos.top) < 0.5 && Math.abs(prev.left - pos.left) < 0.5) { setGripFading(false); return; }
            gripPosRef.current = pos; setGripFading(false); setGripPos(pos);
        };
        editor.on('NodeChange', evalGrip);
        editor.on('input', evalGrip);
        editor.on('blur', clearGrip);

        // Editar HTML inline aberto + clique noutro bloco → fechar (descarta a edição).
        editor.on('mousedown', () => { if (htmlBlockRef.current) endHtmlEdit(); });


        // Scroll de contentor EXTERNO (fora do iframe) / resize da janela: reavaliar ambos os overlays.
        // Capture=true apanha scroll de qualquer ancestral com overflow. Removido no 'remove'.
        // Scroll com o menu de inserção aberto → fechá-lo (o menu é fixed e separar-se-ia do "+").
        const closeMenuIfOpen = () => { if (plusMenuOpenRef.current) closePlusMenu(); setGripMenu(null); setStyleMenu(null); if (hrRef.current) { hrRef.current = null; setHrCtl(null); } };
        // Pega faz fade-out durante o scroll e reaparece alinhada quando este pára (debounce).
        // Não desmonta: só varia a opacidade (transição CSS) → desaparecer suave.
        let gripScrollTimer: ReturnType<typeof setTimeout> | null = null;
        const gripOnScroll = () => {
            setGripFading(true);
            if (gripScrollTimer) clearTimeout(gripScrollTimer);
            gripScrollTimer = setTimeout(() => { setGripFading(false); evalGrip(); }, 150);
        };
        const onScroll = () => { closeMenuIfOpen(); gripOnScroll(); if (htmlBlockRef.current) repositionHtmlEdit(); };
        const evalOverlays = () => { closeMenuIfOpen(); gripOnScroll(); if (htmlBlockRef.current) repositionHtmlEdit(); };
        editor.on('init', () => {
            editor.getWin().addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', evalOverlays);
        });
        editor.on('remove', () => {
            editor.getWin()?.removeEventListener('scroll', onScroll);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', evalOverlays);
        });
    };

    const internal: BlockOverlaysInternal = {
        plusMenu, gripPos, gripFading, gripMenu, hrCtl, htmlEdit, htmlEditPos, dropLine,
        htmlTextareaRef, styleMenu,
        closePlusMenu, plusAction,
        startBlockDrag, moveBlock, setGripMenu, onGripEnter, onGripLeave, gripAction, setHrWidth, deleteHr, endHtmlEdit, saveHtmlEdit,
        startHtmlEdit, openStyleMenu, styleAction, setStyleMenu, replaceInDocument, countInDocument,
        onHtmlEditCloseRef,
    };
    const render = <BlockOverlays {...internal} readOnly={readOnly} wholeBookLoaded={wholeBookLoaded} chapterLabel={chapterLabel} />;

    return { render, mount: wireEditor, startHtmlEdit, openStyleMenu };
}

export type BlockOverlaysHandle = ReturnType<typeof useBlockOverlays>;
