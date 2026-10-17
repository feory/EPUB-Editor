import { useRef, useState } from 'react';
import type { TinyMCEEditor } from './types';
import { BlockOverlays, type BlockOverlaysProps, type ElementAction } from './overlays/BlockOverlays';
import { useHtmlEdit } from './overlays/HtmlEdit';
import { attachMiniMenu, type MiniMenu } from './miniMenu';
import { editBlocks } from './blockEdit';
import { layoutMenuButton, layoutBoxBar, layoutGridPlus, layoutParentHandle } from './menuButton';
import { addGridCell, cellOf, isGridEmpty, type GridCellKind } from './gridProps';
import { applyBoxProps, readBoxProps, type BoxVariant } from './boxProps';
import { GRID_HTML, removeElement } from '../../../utils/containers';
import * as bm from './blockMenu';
import type { ActiveBlock } from './activeBlock';
import { plusCenterY, PLUS_SIZE } from './blockGeometry';
import { topLevelBlock, hitsPlus, gripState, gripZone, dropTargetAt, changeDetector } from './blockInteraction';
import { MARK, BODY_CLASS } from './ephemeral';
import { miniMenuAnchor, usePopupDismiss } from './overlays/popupDismiss';
import { createMenus, type OpenMenu, type Pos } from './openMenu';

// readOnly atravessa de fora; tudo o resto em BlockOverlaysProps só alimenta o render interno.
type BlockOverlaysInternal = Omit<BlockOverlaysProps, 'readOnly'>;

const noop0 = () => 0;

// iframe do editor (dentro do container); todas as posições de overlay derivam do seu rect.
const iframeOf = (editor: TinyMCEEditor) =>
    (editor.getContainer()?.querySelector('iframe') as HTMLIFrameElement | null);

export interface BlockOverlaysOptions {
    activeChapterIndex: number;
    // Substituição em todo o LIVRO mesmo com só um capítulo carregado no editor — sem isto
    // (activeChapterIndex !== -1), o find/replace só alcança o texto que está na DOM.
    onCountInWholeBook?: (find: string) => number;
    onReplaceInWholeBook?: (find: string, replaceWith: string) => number;
    readOnly?: boolean;
    wholeBookLoaded: boolean;
    chapterLabel: string;
    onOpenPanel?: () => void;   // abre o painel de edição (botão "Atributos" da barra da grelha)
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
    const { activeChapterIndex, onCountInWholeBook = noop0, onReplaceInWholeBook = noop0, readOnly, wholeBookLoaded, chapterLabel, onOpenPanel } = options;
    // Edição de HTML inline (overlays/HtmlEdit.tsx): estado, vista e procurar/substituir próprios.
    const htmlEdit = useHtmlEdit(editorRef, { activeChapterIndex, onCountInWholeBook, onReplaceInWholeBook, wholeBookLoaded, chapterLabel });
    // Bloco da pega (::before do bloco ativo, em CSS — blockGeometry.ts) no último clique nela.
    const gripBlockRef = useRef<HTMLElement | null>(null);
    // Mini-menu (miniMenu.ts): o único que mexe no pop; aqui só se pede para o esconder.
    const miniMenuRef = useRef<MiniMenu | null>(null);
    // Menus flutuantes (inserção "+", pega, elemento ⋮, grelha, "Mais estilos"): no máximo um aberto;
    // o que se esconde enquanto abertos deriva do menu (openMenu.ts). Os adapters leem refs só quando
    // chamados (eventos), nunca no render.
    const [menu, setMenu] = useState<OpenMenu | null>(null);
    // eslint-disable-next-line react-hooks/refs
    const [menus] = useState(() => createMenus({
        suppressMiniMenu: (reason, on) => miniMenuRef.current?.suppress(reason, on),
        setGripMenuClass: (on) => editorRef.current?.getBody()?.classList.toggle(BODY_CLASS.gripMenu, on),
        markPlusBlock: (block, on) => { if (on) block.setAttribute(MARK.plusOpen, '1'); else block.removeAttribute(MARK.plusOpen); },
        reevaluate: () => editorRef.current?.nodeChanged(),
    }, setMenu));
    const gripMenu = menu?.kind === 'grip' ? menu.pos : null;
    const plusMenu = menu?.kind === 'plus' ? menu.pos : null;
    const elMenu = menu?.kind === 'element' ? menu.state : null;
    const gridMenu = menu?.kind === 'grid' ? menu.state : null;
    const styleMenu = menu?.kind === 'style' ? menu.state : null;
    // Impede o clique no próprio ⋮ de reabrir o menu logo a seguir ao mousedown o ter fechado.
    const styleMenuGuardRef = useRef(0);
    const openStyleMenu = (kind: 'para' | 'head') => {
        if (Date.now() < styleMenuGuardRef.current) return; // acabou de fechar (2º clique no ⋮) → não reabrir
        menus.show({ kind: 'style', state: { ...miniMenuAnchor(), kind } });
    };
    // Fechar ao clicar fora (⋮ novamente, outro botão do mini-menu, o iframe do editor, Esc, scroll). O pop do
    // mini-menu (TinyMCE aux) fica acima de um backdrop React — daí o listener global em usePopupDismiss.
    usePopupDismiss(!!styleMenu, editorRef, (t) => !!(t as HTMLElement).closest?.('[data-style-menu]'), () => {
        menus.close('style');
        styleMenuGuardRef.current = Date.now() + 300; // click do ⋮ que se segue não reabre
    });
    // Âncora no cursor: o menu fecha, o editor recupera o foco e o comando abre o diálogo do nome.
    const anchorAction = () => {
        menus.close('style');
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        editor.execCommand('mceInsertAnchor');
    };
    const styleAction = (format: string) => {
        menus.close('style');
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        // Estilos de parágrafo (p-bold, p-indent, ...) são formatos de SELECTOR ('p,li') — não
        // casam num bloco ainda h1/h2/h3, por isso o toggle não fazia nada (só "Padrão" convertia
        // a tag). Ao vir de um título, converte primeiro para <p> antes de aplicar a classe.
        editBlocks(editor, () => {
            if (!/^(h1|h2|h3|p)$/.test(format)) {
                const block = editor.selection.getNode()?.closest?.('h1,h2,h3');
                if (block) editor.execCommand('FormatBlock', false, 'p');
            }
            editor.formatter.toggle(format); // h1-3 sincroniza o marcador de capítulo via FormatApply/FormatRemove
        });
    };
    // Controlo de largura da divisória ao passar o rato sobre um <hr>.
    const [hrCtl, setHrCtl] = useState<Pos | null>(null);
    const hrRef = useRef<HTMLElement | null>(null);
    const setHrWidth = (full: boolean) => {
        const editor = editorRef.current; const hr = hrRef.current;
        if (!editor || !hr) return;
        editBlocks(editor, () => {
            if (full) editor.dom.addClass(hr, 'divider-full'); else editor.dom.removeClass(hr, 'divider-full');
        });
        // reposicionar o controlo (a largura mudou)
        const iframe = iframeOf(editor);
        if (iframe) { const ir = iframe.getBoundingClientRect(); const r = hr.getBoundingClientRect();
            setHrCtl({ top: ir.top + r.top + r.height / 2, left: ir.left + r.left + r.width / 2 }); }
    };
    const deleteHr = () => {
        const editor = editorRef.current; const hr = hrRef.current;
        if (!editor || !hr) return;
        hrRef.current = null; setHrCtl(null);
        editBlocks(editor, () => {
            editor.dom.remove(hr);
            editor.focus();
        });
    };

    // Botão "⋮" no canto superior direito do elemento selecionado (bloco ativo ou imagem): abre o menu de
    // ações do elemento (copiar, duplicar, inserir, estilos, agrupar, eliminar) e do contentor à volta.
    const [menuBtn, setMenuBtn] = useState<Pos | null>(null);
    const menuTargetRef = useRef<HTMLElement | null>(null);
    const clearBoxRef = useRef<() => void>(() => {}); // posto no wireEditor
    const selectBoxRef = useRef<(box: HTMLElement) => void>(() => {}); // idem
    const styleClipRef = useRef<bm.StyleSnapshot | null>(null); // "Copiar estilos" → "Colar estilos"
    // Caixa selecionada ao clicar na sua área (fora dos parágrafos): anel à volta, mini-menu próprio (barra com ⋮).
    const selectedBoxRef = useRef<HTMLElement | null>(null);
    const [boxBar, setBoxBar] = useState<(Pos & { kind: 'box' | 'grid'; variant: BoxVariant }) | null>(null);
    // `rect` = o botão que abriu o menu (o do canto do elemento ou o da barra da caixa).
    const openElementMenu = (rect: DOMRect) => {
        const el = menuTargetRef.current;
        if (!el) return;
        const container = bm.containerOf(el);
        const up = window.innerHeight - rect.bottom < 380; // sem espaço por baixo → abre para cima
        menus.show({ kind: 'element', state: {
            top: up ? rect.top - 4 : rect.bottom + 4, left: rect.right, up,
            hasStyles: !!styleClipRef.current, boxed: !!bm.boxOf(el),
            container: container ? (container.classList.contains('grid') ? 'grid' : 'box') : null,
        } });
    };
    // "+" interno da grelha (coluna / texto / imagem) — posição e menu.
    const gridTargetRef = useRef<HTMLElement | null>(null);
    const [gridPlus, setGridPlus] = useState<Pos | null>(null);
    // Pega "selecionar grelha/caixa": difícil acertar na área do contentor quando as células o enchem.
    const parentTargetRef = useRef<HTMLElement | null>(null);
    const [parentHandle, setParentHandle] = useState<(Pos & { kind: 'box' | 'grid' }) | null>(null);
    const openGridMenu = (rect: DOMRect) => {
        const up = window.innerHeight - rect.bottom < 190;
        menus.show({ kind: 'grid', state: { top: up ? rect.top - 4 : rect.bottom + 4, left: rect.left + rect.width / 2, up } });
    };
    const gridAction = (kind: GridCellKind) => {
        const editor = editorRef.current; const grid = gridTargetRef.current;
        menus.close('grid');
        if (!editor || !grid?.isConnected) return;
        clearBoxRef.current();
        const after = cellOf(grid, editor.selection.getNode()); // depois da célula onde está o cursor, senão no fim
        editBlocks(editor, () => {
            const p = addGridCell(grid, kind, after);
            editor.focus();
            editor.selection.setCursorLocation(p, 0);
        });
        if (kind === 'image') editor.execCommand('mceImage'); // abre o diálogo: fora do passo de undo
    };
    const setBoxVariant = (variant: BoxVariant) => {
        const editor = editorRef.current; const box = selectedBoxRef.current;
        if (!editor || !box) return;
        editBlocks(editor, () => { applyBoxProps(editor.dom, box, { variant }); editor.focus(); }); // foco no editor: a barra só se mostra com foco
    };
    const elementAction = (action: ElementAction) => {
        const editor = editorRef.current; const el = menuTargetRef.current;
        menus.close('element');
        if (!editor || !el?.isConnected) return;
        const container = bm.containerOf(el);
        if (action === 'selectContainer') { if (container) selectBoxRef.current(container); return; }
        clearBoxRef.current(); // a ação muda o DOM: a caixa deixa de estar "selecionada"
        const body = editor.getBody();
        const place = (n: Element | null) => { // cursor no elemento (parágrafo/título) ou seleciona-o (imagem, tabela…)
            if (!n?.isConnected) return;
            if (/^(P|H[1-6])$/.test(n.nodeName)) editor.selection.setCursorLocation(n, 0); else editor.selection.select(n, true);
        };
        const toClipboard = (html: string) => {
            const blob = (type: string) => new Blob([html], { type });
            navigator.clipboard.write([new ClipboardItem({ 'text/html': blob('text/html'), 'text/plain': blob('text/plain') })])
                .catch(() => navigator.clipboard.writeText(html)).catch(() => {});
        };
        const remove = (target: Element) => { // eliminar mantendo invariantes (coluna ganha parágrafo, caixa vazia sai)
            const next = removeElement(target, body);
            editor.focus(); // antes do cursor/nodeChanged: o anel do bloco ativo só se aplica com foco
            place(next);
        };
        if (action === 'copy') { toClipboard(bm.copyHtml(el)); editor.focus(); return; }
        if (action === 'copyStyles') { styleClipRef.current = bm.snapshotStyles(el); editor.focus(); return; }
        editBlocks(editor, () => {
            switch (action) {
                case 'cut': toClipboard(bm.copyHtml(el)); remove(bm.blockOf(el)); break;
                case 'duplicate': { const c = bm.duplicate(el); editor.focus(); place(c); break; }
                case 'before': case 'after': { const p = bm.insertEmptyParagraph(el, action); editor.focus(); place(p); break; }
                case 'pasteStyles': if (styleClipRef.current) bm.applyStyles(el, styleClipRef.current); editor.focus(); break;
                case 'group': bm.groupInBox(el); editor.focus(); place(bm.blockOf(el)); break;
                case 'ungroup': { const box = bm.boxOf(el); if (box) bm.ungroup(box); editor.focus(); place(bm.blockOf(el)); break; }
                case 'delete': remove(el); break;
                case 'duplicateContainer': if (container) { const c = bm.duplicate(container); editor.focus(); place(c.querySelector('p,h1,h2,h3,h4,h5,h6') ?? c); } break;
                case 'deleteContainer': if (container) remove(container); break;
            }
        });
    };

    // Mover o bloco de topo uma posição para cima/baixo (setas na pega).
    const moveBlock = (dir: 'up' | 'down') => {
        const editor = editorRef.current;
        const block = gripBlockRef.current;
        if (!editor || !block) return;
        const top = topLevelBlock(block, editor.getBody());
        const sib = (dir === 'up' ? top.previousElementSibling : top.nextElementSibling) as HTMLElement | null;
        const parent = top.parentNode;
        if (!sib || !parent) return;
        editBlocks(editor, () => { // nodeChanged no fim reavalia a pega no novo sítio
            parent.insertBefore(top, dir === 'up' ? sib : sib.nextSibling);
            editor.selection.select(block); editor.selection.collapse(true);
            editor.focus();
        });
    };

    // Ações do menu da pega sobre o bloco ativo (formato) ou o bloco de topo (duplicar/eliminar).
    // Fechar o menu da pega clicando fora: se o clique foi no texto do editor, o cursor vai para
    // esse ponto (o parágrafo volta a ficar ativo) — o fundo do menu apanhava o clique e o editor
    // ficava sem seleção. Fora do editor só fecha. Não é um 'click' no bloco: não o recolhe.
    const dismissGripMenu = (x: number, y: number) => {
        menus.close('grip');
        const editor = editorRef.current;
        const iframe = editor && iframeOf(editor);
        if (!editor || !iframe) return;
        const ir = iframe.getBoundingClientRect();
        if (x < ir.left || x > ir.right || y < ir.top || y > ir.bottom) return;
        const doc = editor.getDoc() as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
        let rng: Range | null = doc.caretRangeFromPoint?.(x - ir.left, y - ir.top) ?? null;
        if (!rng && doc.caretPositionFromPoint) { // Firefox
            const pos = doc.caretPositionFromPoint(x - ir.left, y - ir.top);
            if (pos) { rng = doc.createRange(); rng.setStart(pos.offsetNode, pos.offset); rng.collapse(true); }
        }
        if (!rng) return;
        editor.focus(); // antes do setRng: o focus pode repor a seleção anterior
        editor.selection.setRng(rng);
        editor.nodeChanged();
    };
    // Menu da pega: só duplicar/eliminar o bloco de topo.
    const gripAction = (action: 'duplicate' | 'delete') => {
        menus.close('grip');
        const editor = editorRef.current;
        const block = gripBlockRef.current;
        if (!editor || !block) return;
        const top = topLevelBlock(block, editor.getBody());
        editBlocks(editor, () => {
            if (action === 'duplicate') top.parentNode?.insertBefore(top.cloneNode(true), top.nextSibling);
            else top.remove();
            editor.focus(); // antes do nodeChanged: o anel do bloco ativo só se aplica com foco
        });
    };

    // Botão "+" → abre um menu de inserção; escolher insere um novo bloco a seguir ao bloco-âncora.
    // Chamado pelo clique no "+" (CSS ::after do bloco, ver contentStyles.ts); pos em coords da viewport.
    const openPlusMenu = (block: HTMLElement, pos: Pos) => menus.show({ kind: 'plus', pos, block });
    const plusAction = (type: string) => {
        const block = menus.current?.kind === 'plus' ? menus.current.block : null;
        menus.close('plus');
        const editor = editorRef.current;
        if (!editor || !block || !block.parentNode) return;
        if (type === 'hr') { // divisória: só o <hr> (sem parágrafo extra)
            const parent = block.parentNode;
            editBlocks(editor, () => {
                const hr = editor.dom.create('hr', {});
                parent.insertBefore(hr, block.nextSibling);
                const after = hr.nextSibling as HTMLElement | null;
                if (after && /^(P|H[1-6])$/.test(after.nodeName)) editor.selection.setCursorLocation(after, 0);
                else { editor.selection.select(block); editor.selection.collapse(false); }
                editor.focus();
            });
            return;
        }
        if (type === 'grid') { // caixa com grelha vazia: fica selecionada, o "+" interno acrescenta células
            const parent = block.parentNode;
            let box: HTMLElement | null = null;
            editBlocks(editor, () => {
                const wrap = editor.dom.create('div', {}, '');
                wrap.innerHTML = GRID_HTML;
                box = wrap.firstElementChild as HTMLElement;
                parent.insertBefore(box, block.nextSibling);
                editor.focus();
            });
            if (box) selectBoxRef.current(box);
            return;
        }
        if (type === 'chapterbreak') { // marcador+conteúdo próprios, ver comando mceChapterBreak
            editor.selection.select(block);
            editor.selection.collapse(false);
            editor.execCommand('mceChapterBreak');
            return;
        }
        const parent = block.parentNode;
        editBlocks(editor, () => { // bloco novo + estilo = um passo de undo
            const p = editor.dom.create('p', {}, '<br data-mce-bogus="1">');
            parent.insertBefore(p, block.nextSibling);
            editor.selection.setCursorLocation(p, 0);
            editor.focus();
            // Reusa comandos/formats existentes (FormatBlock h1-3 dispara syncChapterMarker).
            if (/^h[123]$/.test(type)) editor.execCommand('FormatBlock', false, type);
            else if (type !== 'p' && type !== 'image') editor.formatter.apply(type);
        });
        if (type === 'image') editor.execCommand('mceImage'); // abre diálogo: fora do passo de undo
    };

    // Arrastar o bloco ativo para outro sítio (pega estilo Notion).
    const dragBlockRef = useRef<HTMLElement | null>(null);
    const dropTargetRef = useRef<{ block: HTMLElement; pos: 'before' | 'after' } | null>(null);
    const [dropLine, setDropLine] = useState<{ top: number; left: number; width: number } | null>(null);
    // Arrastar a partir da pega (mousedown DENTRO do editor). startX/startY: coords da janela.
    // O rato pode ser capturado pelo iframe onde o gesto começou: ouvir o editor E a página.
    const startBlockDrag = (startX: number, startY: number) => {
        const editor = editorRef.current;
        const block = gripBlockRef.current;
        if (!editor || !block) return;
        const iframe = iframeOf(editor);
        if (!iframe) return;
        const body = editor.getBody();
        // Arrastar o bloco de TOPO (filho direto do body) — insertBefore no body fica sempre válido,
        // mesmo que o bloco ativo esteja aninhado (ex. dentro de div.box).
        const top = topLevelBlock(block, body);
        dragBlockRef.current = top;
        let moved = false;
        document.body.style.userSelect = 'none';
        const onMove = (clientX: number, clientY: number) => {
            if (!moved) {
                if (Math.abs(clientX - startX) < 4 && Math.abs(clientY - startY) < 4) return;
                moved = true;
            }
            const ir = iframe.getBoundingClientRect();
            const y = clientY - ir.top; // coords do iframe
            const blocks = (Array.from(body.children) as HTMLElement[]).filter((b) => b !== dragBlockRef.current);
            const drop = dropTargetAt(y, blocks.map(b => b.getBoundingClientRect()));
            if (!drop) { dropTargetRef.current = null; setDropLine(null); return; }
            const target = blocks[drop.index]; const pos = drop.pos;
            dropTargetRef.current = { block: target, pos };
            const r = target.getBoundingClientRect();
            setDropLine({ top: ir.top + (pos === 'before' ? r.top : r.bottom), left: ir.left + r.left, width: r.width });
        };
        const editorDoc = editor.getDoc() as Document;
        const onPageMove = (ev: MouseEvent) => onMove(ev.clientX, ev.clientY);
        const onEditorMove = (ev: MouseEvent) => { const ir = iframe.getBoundingClientRect(); onMove(ir.left + ev.clientX, ir.top + ev.clientY); };
        const onUp = () => {
            document.removeEventListener('mousemove', onPageMove);
            document.removeEventListener('mouseup', onUp);
            editorDoc.removeEventListener('mousemove', onEditorMove);
            editorDoc.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
            setDropLine(null);
            // Fim do gesto SEMPRE (também no clique): com dragBlockRef preso, a pega deixava de
            // aparecer e o mini-menu ficava escondido para sempre.
            const drag = dragBlockRef.current;
            const tgt = dropTargetRef.current;
            dragBlockRef.current = null; dropTargetRef.current = null;
            // Clique → menu da pega, sozinho: abrir substitui qualquer outro menu.
            if (!moved) {
                hrRef.current = null; setHrCtl(null);
                menus.show({ kind: 'grip', pos: { top: startY, left: startX + 14 } });
                return;
            }
            miniMenuRef.current?.suppress('grip', false); // o rato já pode não estar na pega
            const parent = drag?.parentNode;
            if (drag && tgt && tgt.block !== drag && parent) {
                const ref = tgt.pos === 'before' ? tgt.block : tgt.block.nextSibling;
                if (ref !== drag) {
                    editBlocks(editor, () => { // nodeChanged no fim reavalia a pega/"+" no novo sítio
                        parent.insertBefore(drag, ref);
                        editor.selection.select(drag); editor.selection.collapse(true);
                        editor.focus();
                    });
                }
            }
        };
        document.addEventListener('mousemove', onPageMove);
        document.addEventListener('mouseup', onUp);
        editorDoc.addEventListener('mousemove', onEditorMove);
        editorDoc.addEventListener('mouseup', onUp);
    };

    // Instala a reação ao editor (chamado pelo setup, com blockOf e o bloco ativo — activeBlock.ts).
    const wireEditor = (
        editor: TinyMCEEditor,
        { blockOf, activeBlock }: { blockOf: (n: Node | null) => Element | null; activeBlock: ActiveBlock },
    ) => {
        const isPlusBlock = (block: HTMLElement | null): block is HTMLElement =>
            !!block && block !== editor.getBody() && /^(P|H[1-6])$/.test(block.nodeName)
            && !/\bchapter-break/.test(block.className);
        miniMenuRef.current = attachMiniMenu(editor, { blockOf });
        // Botão "+": desenhado só em CSS (::after do bloco sob o rato, ver contentStyles.ts).
        // Pseudo-elementos não recebem eventos → o clique chega ao próprio bloco e é reconhecido
        // pela posição (círculo de 20px centrado na borda inferior).
        // Centro do círculo (blockGeometry.ts, a mesma conta que gera o CSS): fim do conteúdo,
        // mais o desvio do bloco ativo.
        const centerOfPlus = (block: HTMLElement) => plusCenterY(
            block.getBoundingClientRect().bottom - parseFloat(getComputedStyle(block).paddingBottom),
            activeBlock.current() === block,
        );
        // O 'click' que se segue ao mousedown no "+" contaria como "2.º clique no mesmo bloco"
        // (activeBlock.ts → recolhido) e tirava o anel ao parágrafo; engolido antes de lá chegar.
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
            if (!hitsPlus(e.clientX, e.clientY, br, centerOfPlus(block))) return;
            // Com outro bloco ativo o "+" deste está escondido (CSS) → clique normal.
            const active = activeBlock.current();
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
            openPlusMenu(block, { top: ir.top + centerOfPlus(block) - PLUS_SIZE / 2, left: ir.left + br.left + br.width / 2 });
        });
        // Pega de mover: ::before do bloco ativo (CSS, blockGeometry.ts). O CSS não sabe onde está o
        // rato nem a altura do bloco: aqui decide-se se aparece (rato perto da linha esquerda →
        // body.ps-grip-near) e a que altura (--grip-y: a meio da parte visível do bloco). O body
        // não entra no conteúdo gravado. O clique usa a mesma posição (gripTopY).
        let lastX = -1, lastY = -1;     // rato, coords do iframe
        let gripTopY: number | null = null; // topo da pega (coords do iframe) quando visível
        const gripBlock = () => {
            const block = activeBlock.current();
            return isPlusBlock(block) && block.parentNode === editor.getBody() && !block.hasAttribute(MARK.empty) ? block : null;
        };
        const updateGrip = () => {
            const body = editor.getBody();
            const block = dragBlockRef.current ? null : gripBlock();
            const br = block?.getBoundingClientRect() ?? null;
            const { top, overGrip } = gripState({ x: lastX, y: lastY }, br, gripTopY, editor.getWin().innerHeight);
            if (br && top !== null) body.style.setProperty('--grip-y', `${top - br.top}px`);
            gripTopY = top;
            body.classList.toggle(BODY_CLASS.gripNear, top !== null);
            // Rato em cima da pega → mini-menu escondido (fica por cima dela). A arrastar, só o fim
            // do arrasto o repõe.
            if (!dragBlockRef.current) miniMenuRef.current?.suppress('grip', overGrip);
        };
        editor.on('mousemove', (e: MouseEvent) => { lastX = e.clientX; lastY = e.clientY; updateGrip(); });
        editor.on('NodeChange', updateGrip);
        // Rato sai do editor: sem mousemove a pega ficava visível.
        editor.on('init', () => editor.getDoc().documentElement.addEventListener('mouseleave', () => { lastX = lastY = -1; updateGrip(); }));
        editor.on('mousedown', (e: MouseEvent) => {
            if (e.button !== 0 || editor.mode.isReadOnly() || gripTopY === null) return;
            const block = gripBlock();
            const iframe = iframeOf(editor);
            if (!block || !iframe) return;
            const zone = gripZone({ x: e.clientX, y: e.clientY }, block.getBoundingClientRect().left, gripTopY);
            if (!zone) return;
            e.preventDefault();
            swallowClick = true; // o click a seguir não conta como 2.º clique no bloco
            gripBlockRef.current = block;
            if (zone !== 'drag') { moveBlock(zone); return; }
            const ir = iframe.getBoundingClientRect();
            startBlockDrag(ir.left + e.clientX, ir.top + e.clientY);
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


        // Editar HTML inline aberto + clique noutro bloco → fechar (descarta a edição).
        editor.on('mousedown', () => { if (htmlEdit.isOpen()) htmlEdit.close(); });


        // Caixa selecionada: marca de UI (nunca exporta) + classe no body (esconde o anel do parágrafo) +
        // mini-menu do parágrafo escondido. Dura até novo clique, tecla, ou o cursor sair da caixa.
        const clearBox = () => {
            const box = selectedBoxRef.current;
            if (!box) return;
            selectedBoxRef.current = null;
            if (box.isConnected) editor.dom.setAttrib(box, MARK.box, null);
            editor.getBody().classList.remove(BODY_CLASS.boxSelected);
            miniMenuRef.current?.suppress('boxSelected', false);
        };
        clearBoxRef.current = clearBox;
        const selectBox = (box: HTMLElement) => {
            if (selectedBoxRef.current !== box) {
                clearBox();
                selectedBoxRef.current = box;
                editor.dom.setAttrib(box, MARK.box, '1');
                editor.getBody().classList.add(BODY_CLASS.boxSelected);
                miniMenuRef.current?.suppress('boxSelected', true);
            }
            // A seleção dura até novo clique/tecla (a grelha vazia não tem onde pôr o cursor).
            updateOverlays();
        };
        selectBoxRef.current = selectBox;
        // Clicar na área da caixa ou da grelha (padding, espaço entre células, grelha vazia) seleciona-a; dentro de um bloco não.
        editor.on('click', (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            const box = t.matches?.('.box, .grid') ? t : null; // a área do próprio elemento (não de um bloco lá dentro)
            if (box) selectBox(box); else { clearBox(); updateOverlays(); }
        });
        editor.on('keydown', () => { if (selectedBoxRef.current) { clearBox(); updateOverlays(); } });

        // Posição do botão "⋮" (ou da barra da caixa): acompanha NodeChange/scroll/resize; escondido sem foco,
        // em leitura, a arrastar ou com o elemento fora da área visível do editor.
        const menuBtnChanged = changeDetector(); // só faz setState quando a posição mudou
        const gridPlusChanged = changeDetector();
        const parentChanged = changeDetector();
        const updateMenuBtn = () => {
            const iframe = iframeOf(editor);
            const node = editor.selection.getNode();
            let box = selectedBoxRef.current;
            if (box && !box.isConnected) { clearBox(); box = null; }
            const el = editor.hasFocus() && !editor.mode.isReadOnly() && !dragBlockRef.current && !htmlEdit.isOpen()
                ? (box ?? (node.nodeName === 'IMG' ? node : activeBlock.current())) as HTMLElement | null : null;
            const view = el && iframe ? {
                iframe: iframe.getBoundingClientRect(),
                headerHeight: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wp-header-h')) || 57,
                windowHeight: window.innerHeight,
            } : null;
            const r = el?.getBoundingClientRect();
            const pos = el && view && r && !box ? layoutMenuButton({ item: r, ...view }) : null;
            // Limite visível do topo, como o mini-menu: o fundo da barra principal do TinyMCE (presa à janela) ou da app.
            const toxBottom = editor.getContainer()?.querySelector('.tox-editor-header')?.getBoundingClientRect().bottom ?? 0;
            const bar = el && view && r && box
                ? layoutBoxBar({ item: r, iframe: view.iframe, topBound: Math.max(toxBottom, view.headerHeight), windowHeight: view.windowHeight })
                : null;
            menuTargetRef.current = pos || bar ? el : null;
            const variant = box && box.matches('.box') ? readBoxProps(box).variant : '';
            const key = `${pos ? `${pos.top}|${pos.left}` : ''}#${bar ? `${bar.top}|${bar.left}|${variant}|${box?.nodeName}${box?.className}` : ''}`;
            if (!menuBtnChanged(key)) return;
            setMenuBtn(pos);
            setBoxBar(bar ? { ...bar, kind: box?.matches('.grid') ? 'grid' : 'box', variant } : null);
        };
        // "+" interno: grelha da caixa selecionada ou onde está o cursor (só com foco, fora de leitura/arrasto).
        const updateGridPlus = () => {
            const iframe = iframeOf(editor);
            const active = editor.hasFocus() && !editor.mode.isReadOnly() && !dragBlockRef.current && !htmlEdit.isOpen();
            const grid = active ? ((selectedBoxRef.current?.matches('.grid') ? selectedBoxRef.current : selectedBoxRef.current?.querySelector('.grid') ?? editor.dom.getParent(editor.selection.getNode(), '.grid')) as HTMLElement | null) : null;
            const pos = grid && iframe ? layoutGridPlus({
                grid: grid.getBoundingClientRect(), empty: isGridEmpty(grid), iframe: iframe.getBoundingClientRect(),
                headerHeight: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wp-header-h')) || 57,
                windowHeight: window.innerHeight,
            }) : null;
            gridTargetRef.current = pos ? grid : null;
            const key = pos ? `${pos.top}|${pos.left}` : '';
            if (!gridPlusChanged(key)) return;
            setGridPlus(pos);
        };
        const updateParentHandle = () => {
            const iframe = iframeOf(editor);
            const node = editor.selection.getNode();
            const active = editor.hasFocus() && !editor.mode.isReadOnly() && !dragBlockRef.current && !htmlEdit.isOpen() && !selectedBoxRef.current;
            const el = active ? ((node.nodeName === 'IMG' ? node : activeBlock.current()) as HTMLElement | null) : null;
            const container = el ? bm.containerOf(el) : null; // a mais próxima (grelha ou caixa)
            const pos = container && iframe ? layoutParentHandle({
                container: container.getBoundingClientRect(), iframe: iframe.getBoundingClientRect(),
                headerHeight: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wp-header-h')) || 57,
                windowHeight: window.innerHeight,
            }) : null;
            parentTargetRef.current = pos ? container : null;
            const kind = container?.matches('.grid') ? 'grid' : 'box';
            const key = pos ? `${pos.top}|${pos.left}|${kind}` : '';
            if (!parentChanged(key)) return;
            setParentHandle(pos ? { ...pos, kind } : null);
        };
        const updateOverlays = () => { updateMenuBtn(); updateGridPlus(); updateParentHandle(); };
        editor.on('NodeChange input keyup', updateOverlays);

        // Scroll de contentor EXTERNO (fora do iframe) / resize da janela: reavaliar ambos os overlays.
        // Capture=true apanha scroll de qualquer ancestral com overflow. Removido no 'remove'.
        // Scroll com o menu de inserção aberto → fechá-lo (o menu é fixed e separar-se-ia do "+").
        const closeMenuIfOpen = () => { menus.close(); if (hrRef.current) { hrRef.current = null; setHrCtl(null); } };
        const onScroll = () => { closeMenuIfOpen(); updateGrip(); updateOverlays(); if (htmlEdit.isOpen()) htmlEdit.reposition(); };
        const evalOverlays = onScroll;
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
        plusMenu, gripMenu, hrCtl, dropLine, styleMenu, menuBtn, boxBar, setBoxVariant, parentHandle, selectParent: () => { const c = parentTargetRef.current; if (c) selectBoxRef.current(c); }, openGridPanel: () => onOpenPanel?.(), gridPlus, gridMenu, openGridMenu, closeGridMenu: () => menus.close('grid'), gridAction, elMenu, openElementMenu, elementAction, closeElementMenu: () => menus.close('element'),
        closePlusMenu: () => menus.close('plus'), plusAction,
        dismissGripMenu, gripAction, setHrWidth, deleteHr,
        styleAction, anchorAction, closeStyleMenu: () => menus.close('style'),
    };
    const render = <><BlockOverlays {...internal} readOnly={readOnly} />{htmlEdit.element}</>;

    return { render, mount: wireEditor, startHtmlEdit: htmlEdit.start, openStyleMenu };
}

export type BlockOverlaysHandle = ReturnType<typeof useBlockOverlays>;
