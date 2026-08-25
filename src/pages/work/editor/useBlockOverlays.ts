import { useEffect, useRef, useState } from 'react';
import type { TinyMCEEditor } from './types';
import { CHAPTER_SPLIT_PATTERN } from '../../../utils/html-cleaner';

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
}

/**
 * Subsistema de overlays estilo Notion (fora do iframe): botão "+", pega de arrastar,
 * menu de inserção, menu da pega, controlo de divisória e edição de HTML inline.
 * Detém todo o estado/refs/handlers; `wireEditor` instala a lógica que reage ao editor.
 */
export function useBlockOverlays(editorRef: React.MutableRefObject<TinyMCEEditor | null>, options: BlockOverlaysOptions) {
    const { activeChapterIndex, onCountInWholeBook, onReplaceInWholeBook } = options;
    // Botão "+" flutuante: posição (viewport) + bloco-âncora do parágrafo/título com foco.
    const [addBtnPos, setAddBtnPos] = useState<Pos | null>(null);
    const [addBtnFading, setAddBtnFading] = useState(false); // fade-out suave do "+"
    const addBtnPosRef = useRef<Pos | null>(null); // espelho p/ evitar re-render em mousemove
    const addBtnBlockRef = useRef<HTMLElement | null>(null);
    const addBtnFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Pega de arrastar (gutter esquerdo): visível enquanto o bloco está ativo (selecionado), independente do rato.
    const [gripPos, setGripPos] = useState<Pos | null>(null);
    const [gripFading, setGripFading] = useState(false); // fade-out suave durante o scroll
    const gripPosRef = useRef<Pos | null>(null);
    const gripBlockRef = useRef<HTMLElement | null>(null);
    const clearGrip = () => { gripPosRef.current = null; gripBlockRef.current = null; setGripFading(false); setGripPos(null); };
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
        if (!/^(h1|h2|h3|p)$/.test(format)) {
            const block = editor.selection.getNode()?.closest?.('h1,h2,h3');
            if (block) editor.execCommand('FormatBlock', false, 'p');
        }
        editor.formatter.toggle(format); // h1-3 sincroniza o marcador de capítulo via FormatApply/FormatRemove
        editor.dispatch('Change');
        editor.nodeChanged();
    };
    // Controlo de largura da divisória ao passar o rato sobre um <hr>.
    const [hrCtl, setHrCtl] = useState<Pos | null>(null);
    const hrRef = useRef<HTMLElement | null>(null);
    const setHrWidth = (full: boolean) => {
        const editor = editorRef.current; const hr = hrRef.current;
        if (!editor || !hr) return;
        if (full) editor.dom.addClass(hr, 'divider-full'); else editor.dom.removeClass(hr, 'divider-full');
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
    const [htmlEditPos, setHtmlEditPos] = useState<{ top: number; left: number; width: number; height: number; visible: boolean } | null>(null);
    const repositionHtmlEdit = () => {
        const editor = editorRef.current; const block = htmlBlockRef.current;
        if (!editor || !block) return;
        const iframe = iframeOf(editor);
        if (!iframe) return;
        const ir = iframe.getBoundingClientRect(); const r = block.getBoundingClientRect();
        const top = ir.top + r.top;
        // esconder (sem desmontar → preserva o texto) quando o bloco sai da área visível do editor
        const visible = r.bottom > 0 && r.top < ir.height && top >= 0 && top < window.innerHeight;
        setHtmlEditPos({ top, left: ir.left + r.left, width: r.width, height: r.height, visible });
    };
    const endHtmlEdit = () => {
        const block = htmlBlockRef.current;
        if (block) editorRef.current?.dom.setAttrib(block, 'data-mce-htmledit', null); // volta a mostrar o texto
        htmlBlockRef.current = null; setHtmlEdit(null); setHtmlEditPos(null);
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
            setHtmlEditPos({ top: ir.top + r.top, left: ir.left + r.left, width: r.width, height: r.height, visible: true });
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

    // Aplica o novo HTML do body + regista undo + volta a mostrar o bloco que estava a ser
    // editado (índice entre os filhos de topo — sobrevive à troca porque replace de texto não
    // adiciona/remove blocos de topo). Partilhado pelos 2 ramos de replaceInDocument que
    // escrevem localmente no editor (scope 'chapter').
    const commitBodyHtml = (editor: TinyMCEEditor, body: HTMLElement, newBodyHtml: string, anchorBlock: HTMLElement | null) => {
        const anchorIndex = anchorBlock ? Array.from(body.children).indexOf(anchorBlock) : -1;
        editor.dom.setHTML(body, newBodyHtml);
        editor.undoManager.add();
        editor.focus();
        editor.dispatch('Change');
        editor.nodeChanged();
        if (anchorIndex >= 0) {
            (body.children[anchorIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'center' });
        }
    };

    // Contagem de ocorrências (só leitura) — usada pelo mini find/replace para mostrar "N
    // ocorrências" ANTES de aplicar (BlockOverlays, debounced). scope 'document' com só um
    // capítulo carregado no editor: o resto do livro nem está na DOM, conta por fora
    // (onCountInWholeBook, ver useEbookWork.countInWholeBook).
    const countInDocument = (find: string, scope: 'chapter' | 'document'): number => {
        if (!find) return 0;
        if (scope === 'document' && activeChapterIndex !== -1) {
            return onCountInWholeBook ? onCountInWholeBook(find) : 0;
        }
        const editor = editorRef.current;
        if (!editor) return 0;
        return editor.getContent().split(find).length - 1;
    };

    // Substituição literal (todas as ocorrências), acionada a partir do mini find/replace da
    // caixa de edição de HTML (BlockOverlays) — devolve o nº de ocorrências trocadas.
    // split/join em vez de RegExp: sem escaping de caracteres especiais para uma substring
    // literal. dom.setHTML(getBody()) em vez de editor.setContent(): setContent() LIMPA a
    // pilha de undo inteira (pensado para carregar conteúdo pela 1ª vez, não para editar) —
    // testado ao vivo, ficava sempre sem Ctrl+Z possível mesmo com undoManager.add()/
    // transact() a seguir. dom.setHTML + add() cria 1 nível normal.
    const replaceInDocument = (find: string, replaceWith: string, scope: 'chapter' | 'document'): number => {
        const editor = editorRef.current;
        if (!editor || !find) return 0;

        // 'document' com só um capítulo carregado: o resto do livro nem está na DOM — grava
        // por fora do editor (onReplaceInWholeBook → useEbookWork.handleReplaceInWholeBook,
        // mesmo caminho das outras transformações de livro inteiro: commitHtml + autosave). O
        // editor re-sincroniza sozinho a seguir (prop `value` controlada do TinyMCE); sem
        // bloco-âncora local para voltar (o texto trocado pode nem estar no capítulo aberto).
        if (scope === 'document' && activeChapterIndex !== -1) {
            return onReplaceInWholeBook ? onReplaceInWholeBook(find, replaceWith) : 0;
        }

        const body = editor.getBody();

        // Documento Completo mas o utilizador quer só o capítulo do bloco aberto: isola o
        // segmento (CHAPTER_SPLIT_PATTERN, o mesmo regex partilhado pelo resto da app) que
        // contém esse bloco, troca só ali, e reescreve o body com TODOS os segmentos (os
        // outros capítulos ficam bit-a-bit iguais) — Documento Completo continua carregado.
        if (scope === 'chapter' && activeChapterIndex === -1) {
            const anchorBlock = htmlBlockRef.current;
            const anchorHtml = anchorBlock ? editor.dom.getOuterHTML(anchorBlock) : null;
            if (anchorHtml) {
                const segments = editor.getContent().split(CHAPTER_SPLIT_PATTERN);
                const segIndex = segments.findIndex(s => s.includes(anchorHtml));
                if (segIndex !== -1) {
                    const segParts = segments[segIndex].split(find);
                    const count = segParts.length - 1;
                    if (count === 0) return 0;
                    segments[segIndex] = segParts.join(replaceWith);
                    commitBodyHtml(editor, body, segments.join(''), anchorBlock);
                    return count;
                }
                // Bloco não caiu em nenhum segmento (ex.: story sem marcador de capítulo) —
                // cai para o caso simples abaixo (documento inteiro), mais seguro que falhar calado.
            }
        }

        // Caso simples: o que está carregado no editor já é exatamente o âmbito pedido
        // (capítulo único + scope 'chapter', ou Documento Completo + scope 'document').
        const parts = editor.getContent().split(find);
        const count = parts.length - 1;
        if (count === 0) return 0;
        commitBodyHtml(editor, body, parts.join(replaceWith), htmlBlockRef.current);
        return count;
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
        if (action === 'duplicate') {
            top.parentNode?.insertBefore(top.cloneNode(true), top.nextSibling);
        } else if (action === 'delete') {
            top.remove();
        } else {
            editor.selection.select(block); editor.selection.collapse(true);
            if (/^h[123]$/.test(action) || action === 'p') editor.execCommand('FormatBlock', false, action);
            else editor.formatter.apply(action);
        }
        editor.focus();
        editor.dispatch('Change');
        editor.nodeChanged();
    };

    // Esconder o "+" quando o rato sai do editor (sem mousemove não haveria reavaliação → ficaria preso).
    // Grace de 120ms para o utilizador conseguir chegar ao botão (que fica fora do iframe).
    const addBtnHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelAddBtnHide = () => {
        if (addBtnHideTimerRef.current) { clearTimeout(addBtnHideTimerRef.current); addBtnHideTimerRef.current = null; }
    };
    const cancelAddBtnFade = () => { if (addBtnFadeTimerRef.current) { clearTimeout(addBtnFadeTimerRef.current); addBtnFadeTimerRef.current = null; } };
    const clearAddBtn = () => {
        if (plusMenuOpenRef.current) return; // menu de inserção aberto → manter o "+" visível
        cancelAddBtnHide();
        cancelAddBtnFade();
        addBtnPosRef.current = null;
        addBtnBlockRef.current = null;
        setAddBtnFading(false);
        setAddBtnPos(null);
    };
    // Esconder o "+" com fade-out (opacidade → 0, depois desmonta) para um desaparecimento suave.
    const fadeOutAddBtn = () => {
        if (plusMenuOpenRef.current) return; // menu aberto → manter visível
        if (!addBtnPosRef.current) return;   // nada montado
        setAddBtnFading(true);
        if (addBtnFadeTimerRef.current) return; // já a desaparecer
        addBtnFadeTimerRef.current = setTimeout(() => {
            addBtnFadeTimerRef.current = null;
            addBtnPosRef.current = null; addBtnBlockRef.current = null;
            setAddBtnFading(false); setAddBtnPos(null);
        }, 340);
    };

    // Botão "+" → abre um menu de inserção; escolher insere um novo bloco a seguir ao bloco-âncora.
    const [plusMenu, setPlusMenu] = useState<Pos | null>(null);
    const plusMenuOpenRef = useRef(false); // com menu aberto, o "+" não pode ser escondido
    const plusBlockRef = useRef<HTMLElement | null>(null); // âncora fixa (não é limpa pelo timer de esconder)
    const closePlusMenu = () => {
        plusMenuOpenRef.current = false;
        setPlusMenu(null);
        editorRef.current?.nodeChanged(); // reavalia mini-menu + grip (voltam a aparecer)
    };
    const openPlusMenu = (e: React.MouseEvent) => {
        cancelAddBtnHide();
        plusMenuOpenRef.current = true;
        plusBlockRef.current = addBtnBlockRef.current;
        clearGrip(); // esconder a pega enquanto o menu está aberto
        // esconder o mini-menu de bloco (context toolbar) enquanto o menu está aberto
        const pop = document.querySelector('.tox-tinymce-aux .tox-pop') as HTMLElement | null;
        if (pop) pop.style.visibility = 'hidden';
        setPlusMenu({ top: e.clientY - 8, left: e.clientX }); // acima do "+"
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
        const p = editor.dom.create('p', {}, '<br data-mce-bogus="1">');
        block.parentNode.insertBefore(p, block.nextSibling);
        editor.selection.setCursorLocation(p, 0);
        editor.focus();
        // Reusa comandos/formats existentes (FormatBlock h1-3 dispara syncChapterMarker).
        if (/^h[123]$/.test(type)) editor.execCommand('FormatBlock', false, type);
        else if (type === 'image') editor.execCommand('mceImage');
        else if (type !== 'p') editor.formatter.apply(type);
        editor.dispatch('Change');
        editor.nodeChanged();
    };

    // Arrastar o bloco ativo para outro sítio (pega estilo Notion).
    const dragBlockRef = useRef<HTMLElement | null>(null);
    const dropTargetRef = useRef<{ block: HTMLElement; pos: 'before' | 'after' } | null>(null);
    const [dropLine, setDropLine] = useState<{ top: number; left: number; width: number } | null>(null);
    const startBlockDrag = (e: React.MouseEvent) => {
        e.preventDefault();
        cancelAddBtnHide();
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
            addBtnPosRef.current = null; addBtnBlockRef.current = null; setAddBtnPos(null); // esconder o "+" após mover
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    // Instala a reação ao editor (chamado pelo setup, depois de definir blockOf/hiddenBlock).
    const wireEditor = (
        editor: TinyMCEEditor,
        { blockOf, getHiddenBlock }: { blockOf: (n: Node | null) => Element | null; getHiddenBlock: () => Element | null },
    ) => {
        // Botão "+" flutuante na aresta inferior do bloco ATIVO (o que tem a borda preta).
        // Só aparece se o rato estiver ABAIXO da linha da borda inferior desse bloco; senão oculto.
        const isPlusBlock = (block: HTMLElement | null): block is HTMLElement =>
            !!block && block !== editor.getBody() && /^(P|H[1-6])$/.test(block.nodeName)
            && !/\bchapter-break/.test(block.className);
        // Rato por cima da toolbar (sticky ou não) → mini-menu de bloco escondido (ver forcePopAbove).
        let toolbarHovered = false;
        const hideAddBtn = () => fadeOutAddBtn(); // esconder com fade-out suave
        const placeAddBtn = (block: HTMLElement, br: DOMRect, ir: DOMRect) => {
            cancelAddBtnFade(); setAddBtnFading(false); // reaparece opaco
            // -10 = centrar o botão (20px) no ponto; sem utilitários -translate para não
            // colidir com a animação de entrada (que também usa transform).
            const posTop = ir.top + br.bottom - 10;
            // Clamp à janela: scroll de contentor externo pode pôr o bloco fora de vista.
            if (posTop < 0 || posTop > window.innerHeight) { hideAddBtn(); return; }
            addBtnBlockRef.current = block;
            const pos = { top: posTop, left: ir.left + br.left + br.width / 2 - 10 };
            const prev = addBtnPosRef.current;
            if (prev && Math.abs(prev.top - pos.top) < 0.5 && Math.abs(prev.left - pos.left) < 0.5) return;
            addBtnPosRef.current = pos;
            setAddBtnPos(pos);
        };
        let lastMouseY = -1; // Y do rato em coords do iframe (-1 = desconhecido)
        let lastMouseX = -1; // X do rato em coords do iframe
        // Zona clicável abaixo da borda para alcançar o "+" (px em coords do iframe).
        const PLUS_BAND = 40;
        // Zona à esquerda da aresta do bloco onde a pega aparece.
        const GRIP_BAND = 36;
        const evalAddBtn = () => {
            // Segue o rato dentro do bloco ATIVO (foco + data-mce-psactive); com um bloco ativo,
            // o "+" nunca salta para outro parágrafo só por o rato passar por cima dele.
            const iframe = iframeOf(editor);
            if (!iframe) { hideAddBtn(); return; }
            if (lastMouseY < 0) { hideAddBtn(); return; } // rato nunca visto neste iframe
            const ir = iframe.getBoundingClientRect();
            const activeBlock = blockOf(editor.selection.getNode()) as HTMLElement | null;
            let block: HTMLElement | null = null;
            if (activeBlock && isPlusBlock(activeBlock) && activeBlock !== getHiddenBlock()) {
                const bottom = activeBlock.getBoundingClientRect().bottom;
                if (bottom >= lastMouseY - PLUS_BAND && lastMouseY >= bottom - 2) block = activeBlock;
            } else {
                // Sem bloco ativo (ainda nenhum clicado nesta sessão): segue o rato como antes.
                // Os blocos estão em ordem de documento → a borda inferior cresce monotonicamente.
                // Parar assim que passa a zona do rato evita varrer o livro inteiro (milhares de
                // getBoundingClientRect por evento em "Documento Completo").
                for (let b = editor.getBody().firstElementChild as HTMLElement | null; b; b = b.nextElementSibling as HTMLElement | null) {
                    const bottom = b.getBoundingClientRect().bottom;
                    if (bottom > lastMouseY + PLUS_BAND) break;
                    // Não sai no 1º match: com blocos curtos/próximos vários podem servir a mesma
                    // zona do rato — fica sempre com o mais próximo (bottom maior, ainda ≤ mouseY).
                    if (bottom >= lastMouseY - PLUS_BAND && lastMouseY >= bottom - 2 && isPlusBlock(b) && b !== getHiddenBlock()) block = b;
                }
            }
            if (!block) { hideAddBtn(); return; }
            const br = block.getBoundingClientRect();
            // Fora da área visível do editor → esconder (o "+" fixo sobreporia toolbar/navbar).
            if (br.bottom < 0 || br.bottom > ir.height) { hideAddBtn(); return; }
            placeAddBtn(block, br, ir);
        };
        editor.on('mousemove', (e: MouseEvent) => { lastMouseX = e.clientX; lastMouseY = e.clientY; evalAddBtn(); evalGrip(); });
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
        // Só mousemove: o "+" segue o RATO (não a seleção), logo reavaliar a cada tecla
        // ('input'/'NodeChange') repetia a mesma conta com o rato parado — era o custo
        // dominante a escrever em documentos grandes.
        editor.on('blur', hideAddBtn);

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

        // Mini-bar (context toolbar) só na parte superior: o TinyMCE 8 auto-flipa
        // norte/sul e não expõe knob para fixar. Reposicionamos o pop para cima do
        // bloco depois de o tema o posicionar, via observer da aux dos popups inline.
        const forcePopAbove = () => {
            const pop = document.querySelector('.tox-tinymce-aux .tox-pop') as HTMLElement | null;
            if (!pop || !pop.offsetHeight) return; // ausente/escondido pelo TinyMCE
            if (toolbarHovered) { pop.style.visibility = 'hidden'; return; } // rato na toolbar → esconde bubble e mini-menu por igual
            if (!editor.selection.isCollapsed()) return; // seleção de texto → é o bubble, não mexer
            if (plusMenuOpenRef.current) { pop.style.visibility = 'hidden'; return; } // menu de inserção aberto
            // blockOf não inclui 'li' (grip/+ não se estendem a listas, ver parastyles em
            // setup.ts) — fallback próprio, senão o mini-menu de estilos num bullet nunca
            // passava daqui: ficava com a visibility que o TinyMCE lhe deu por defeito (às
            // vezes hidden), só revelada indiretamente ao passar o rato pela toolbar (que
            // repõe visibility='' sem depender deste gate).
            const selNode = editor.selection.getNode();
            const block = (blockOf(selNode) || editor.dom.getParent(selNode, 'li')) as HTMLElement | null;
            if (!block || !/^(P|H[1-6]|LI)$/.test(block.nodeName)) return;
            const iframe = iframeOf(editor);
            if (!iframe) return;
            const ir = iframe.getBoundingClientRect();
            const br = block.getBoundingClientRect();
            const blockTop = ir.top + br.top;
            const blockBottom = ir.top + br.bottom;
            const blockVisible = br.top < ir.height && br.bottom > 0;
            // Reposiciona para um lado só se ainda não lá está — set incondicional de style.top
            // faria o auxObserver (attributeFilter 'style') disparar em loop, visto como o
            // mini-menu a "cair"/tremer em vez de ficar fixo.
            const placeAt = (desired: number, alreadyThere: boolean, removeClass: string, addClass: string) => {
                pop.style.visibility = '';
                if (!alreadyThere) {
                    pop.style.top = desired + 'px';
                    pop.classList.remove(removeClass);
                    pop.classList.add(addClass);
                }
            };
            // Preferência: em cima. Precisa de espaço acima (dentro da área do editor) E o bloco visível.
            const desiredTop = blockTop - pop.offsetHeight - 8;
            if (desiredTop >= ir.top + 4 && blockVisible) {
                placeAt(desiredTop, pop.getBoundingClientRect().top < blockTop, 'tox-pop--top', 'tox-pop--bottom');
                return;
            }
            // Sem espaço em cima → tentar em baixo do bloco, sempre dentro da área do editor
            // (mesma referência — ir — que o ramo de cima, não a janela: o iframe pode não
            // ocupar o ecrã todo).
            const desiredBottom = blockBottom + 8;
            if (desiredBottom + pop.offsetHeight <= ir.top + ir.height - 4 && blockVisible) {
                placeAt(desiredBottom, pop.getBoundingClientRect().top >= blockBottom, 'tox-pop--bottom', 'tox-pop--top');
                return;
            }
            pop.style.visibility = 'hidden'; // não cabe em lado nenhum → esconder
        };
        const auxObserver = new MutationObserver(forcePopAbove);

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
        // No scroll o "+" fica COLADO à borda inferior do bloco (segue-a), sem reavaliar o gate
        // do rato — assim não pisca nem se descola. Só esconde se o bloco sair da vista.
        const repositionAddBtn = () => {
            const block = addBtnBlockRef.current;
            if (!block || !addBtnPosRef.current) return; // "+" não mostrado
            const iframe = iframeOf(editor);
            if (!iframe) return;
            const ir = iframe.getBoundingClientRect();
            const br = block.getBoundingClientRect();
            if (br.bottom < 0 || br.bottom > ir.height) { hideAddBtn(); return; } // fora da vista
            const posTop = ir.top + br.bottom - 10;
            if (posTop < 0 || posTop > window.innerHeight) { hideAddBtn(); return; } // fora da janela
            const pos = { top: posTop, left: ir.left + br.left + br.width / 2 - 10 };
            addBtnPosRef.current = pos; setAddBtnPos(pos);
        };
        const onScroll = () => { closeMenuIfOpen(); gripOnScroll(); repositionAddBtn(); if (htmlBlockRef.current) repositionHtmlEdit(); };
        const evalOverlays = () => { closeMenuIfOpen(); evalAddBtn(); gripOnScroll(); if (htmlBlockRef.current) repositionHtmlEdit(); };
        editor.on('init', () => {
            editor.getWin().addEventListener('scroll', onScroll, { passive: true });
            window.addEventListener('scroll', onScroll, true);
            window.addEventListener('resize', evalOverlays);
            // Rato sai do editor → esconder (com grace p/ alcançar o botão); volta a entrar → cancelar.
            editor.getBody().addEventListener('mouseleave', () => {
                addBtnHideTimerRef.current = setTimeout(fadeOutAddBtn, 120);
            });
            editor.getBody().addEventListener('mouseenter', cancelAddBtnHide);
            // Toolbar por cima do editor: rato em cima dela esconde o mini-menu de bloco
            // (fica por baixo, sobreposto); ao sair, volta a aparecer. toolbarHovered lido
            // por forcePopAbove (senão o MutationObserver do aux desfazia o hide sozinho —
            // a própria mutação de visibility disparava forcePopAbove, que a repunha 'visible').
            // Retry: .tox-editor-header pode não existir ainda no exato instante do 'init'
            // (mesma razão do retry do aux abaixo).
            const attachHeaderHover = () => {
                const header = editor.getContainer()?.querySelector('.tox-editor-header') as HTMLElement | null;
                if (!header) return false;
                header.addEventListener('mouseenter', () => { toolbarHovered = true; forcePopAbove(); });
                header.addEventListener('mouseleave', () => {
                    toolbarHovered = false;
                    // Bubble de seleção: forcePopAbove nem chega a mexer (isCollapsed()===false
                    // devolve cedo) — repor visibility diretamente, não confiar só no NodeChange
                    // (o relaunch do context toolbar do TinyMCE nem sempre redispara com o pop
                    // ainda presente no DOM, só escondido).
                    const pop = document.querySelector('.tox-tinymce-aux .tox-pop') as HTMLElement | null;
                    if (pop) pop.style.visibility = '';
                    editor.nodeChanged();
                });
                return true;
            };
            if (!attachHeaderHover()) setTimeout(attachHeaderHover, 0);
            const attach = () => {
                const aux = document.querySelector('.tox-tinymce-aux');
                if (aux) { auxObserver.observe(aux, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] }); return true; }
                return false;
            };
            if (!attach()) setTimeout(attach, 0);
        });
        editor.on('remove', () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', evalOverlays);
            auxObserver.disconnect();
        });
    };

    return {
        addBtnPos, addBtnFading, plusMenu, gripPos, gripFading, gripMenu, hrCtl, htmlEdit, htmlEditPos, dropLine,
        htmlTextareaRef, styleMenu,
        openPlusMenu, closePlusMenu, plusAction, cancelAddBtnHide, clearAddBtn,
        startBlockDrag, moveBlock, setGripMenu, gripAction, setHrWidth, deleteHr, endHtmlEdit, saveHtmlEdit,
        startHtmlEdit, wireEditor, openStyleMenu, styleAction, setStyleMenu, replaceInDocument, countInDocument,
    };
}

export type BlockOverlaysApi = ReturnType<typeof useBlockOverlays>;
