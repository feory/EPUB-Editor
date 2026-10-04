import { useEffect, useRef, useState } from 'react';
import type { TinyMCEEditor } from './types';
import { BlockOverlays, type BlockOverlaysProps } from './overlays/BlockOverlays';
import { useHtmlEdit } from './overlays/HtmlEdit';
import { attachMiniMenu, type MiniMenu } from './miniMenu';
import { editBlocks } from './blockEdit';
import type { ActiveBlock } from './activeBlock';
import { plusCenterY, PLUS_HIT, PLUS_SIZE, gripZoneAt, gripTop, nearGripLine } from './blockGeometry';

// readOnly atravessa de fora; tudo o resto em BlockOverlaysProps só alimenta o render interno.
type BlockOverlaysInternal = Omit<BlockOverlaysProps, 'readOnly'>;

const noop0 = () => 0;

type Pos = { top: number; left: number };

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
    // Edição de HTML inline (overlays/HtmlEdit.tsx): estado, vista e procurar/substituir próprios.
    const htmlEdit = useHtmlEdit(editorRef, { activeChapterIndex, onCountInWholeBook, onReplaceInWholeBook, wholeBookLoaded, chapterLabel });
    // Bloco da pega (::before do bloco ativo, em CSS — blockGeometry.ts) no último clique nela.
    const gripBlockRef = useRef<HTMLElement | null>(null);
    // Mini-menu (miniMenu.ts): o único que mexe no pop; aqui só se pede para o esconder.
    const miniMenuRef = useRef<MiniMenu | null>(null);
    const [gripMenu, setGripMenu] = useState<Pos | null>(null); // menu ao clicar na pega
    // Menu da pega aberto → tudo o resto escondido: mini-menu (motivo próprio, o hover da pega
    // não o repõe), "+" (body.ps-grip-menu → contentStyles.ts). Fechou (escolha, clique fora,
    // scroll) → voltam.
    useEffect(() => {
        miniMenuRef.current?.suppress('gripMenu', !!gripMenu);
        editorRef.current?.getBody()?.classList.toggle('ps-grip-menu', !!gripMenu);
    }, [gripMenu, editorRef]);
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

    // Mover o bloco de topo uma posição para cima/baixo (setas na pega).
    const moveBlock = (dir: 'up' | 'down') => {
        const editor = editorRef.current;
        const block = gripBlockRef.current;
        if (!editor || !block) return;
        const body = editor.getBody();
        let top = block;
        while (top.parentElement && top.parentElement !== body) top = top.parentElement;
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
        setGripMenu(null);
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
        setGripMenu(null);
        const editor = editorRef.current;
        const block = gripBlockRef.current;
        if (!editor || !block) return;
        const body = editor.getBody();
        let top = block;
        while (top.parentElement && top.parentElement !== body) top = top.parentElement;
        editBlocks(editor, () => {
            if (action === 'duplicate') top.parentNode?.insertBefore(top.cloneNode(true), top.nextSibling);
            else top.remove();
            editor.focus(); // antes do nodeChanged: o anel do bloco ativo só se aplica com foco
        });
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
        miniMenuRef.current?.suppress('plusMenu', true);
        setPlusMenu(pos); // acima do "+"
    };
    const plusAction = (type: string) => {
        closePlusMenu();
        const editor = editorRef.current;
        const block = plusBlockRef.current;
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
        let top = block;
        while (top.parentElement && top.parentElement !== body) top = top.parentElement;
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
            // Clique → menu da pega, sozinho: fecham-se os outros menus (efeito do gripMenu esconde o resto).
            if (!moved) {
                if (plusMenuOpenRef.current) closePlusMenu();
                setStyleMenu(null);
                hrRef.current = null; setHrCtl(null);
                setGripMenu({ top: startY, left: startX + 14 });
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
        editor.on('PreInit', () => editor.serializer.addTempAttr('data-mce-plusopen'));
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
            if (Math.abs(e.clientX - (br.left + br.width / 2)) > PLUS_HIT || Math.abs(e.clientY - centerOfPlus(block)) > PLUS_HIT) return;
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
            return isPlusBlock(block) && block.parentNode === editor.getBody() && !block.hasAttribute('data-mce-empty') ? block : null;
        };
        const updateGrip = () => {
            const body = editor.getBody();
            const block = dragBlockRef.current ? null : gripBlock();
            let top: number | null = null;
            let overGrip = false;
            if (block) {
                const br = block.getBoundingClientRect();
                const onGrip = gripTopY !== null && !!gripZoneAt(lastX, lastY, br.left, gripTopY);
                if (onGrip || nearGripLine(lastX, lastY, br)) top = gripTop(br.top, br.bottom, 0, editor.getWin().innerHeight);
                if (top !== null) {
                    body.style.setProperty('--grip-y', `${top - br.top}px`);
                    overGrip = !!gripZoneAt(lastX, lastY, br.left, top);
                }
            }
            gripTopY = top;
            body.classList.toggle('ps-grip-near', top !== null);
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
            const zone = gripZoneAt(e.clientX, e.clientY, block.getBoundingClientRect().left, gripTopY);
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


        // Scroll de contentor EXTERNO (fora do iframe) / resize da janela: reavaliar ambos os overlays.
        // Capture=true apanha scroll de qualquer ancestral com overflow. Removido no 'remove'.
        // Scroll com o menu de inserção aberto → fechá-lo (o menu é fixed e separar-se-ia do "+").
        const closeMenuIfOpen = () => { if (plusMenuOpenRef.current) closePlusMenu(); setGripMenu(null); setStyleMenu(null); if (hrRef.current) { hrRef.current = null; setHrCtl(null); } };
        const onScroll = () => { closeMenuIfOpen(); updateGrip(); if (htmlEdit.isOpen()) htmlEdit.reposition(); };
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
        plusMenu, gripMenu, hrCtl, dropLine, styleMenu,
        closePlusMenu, plusAction,
        dismissGripMenu, gripAction, setHrWidth, deleteHr,
        styleAction, setStyleMenu,
    };
    const render = <><BlockOverlays {...internal} readOnly={readOnly} />{htmlEdit.element}</>;

    return { render, mount: wireEditor, startHtmlEdit: htmlEdit.start, openStyleMenu };
}

export type BlockOverlaysHandle = ReturnType<typeof useBlockOverlays>;
