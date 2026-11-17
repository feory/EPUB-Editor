import { useEffect } from 'react';
import type { TinyMCEEditor } from '../types';
import { useLive } from '../../../../hooks/useLive';

/** Posição para um painel React logo abaixo do pop do Mini-menu (coords da janela, para `position: fixed`). */
export function miniMenuAnchor(): { top: number; left: number } {
    const r = (document.querySelector('.tox-tinymce-aux .tox-pop') as HTMLElement | null)?.getBoundingClientRect();
    return { top: r ? r.bottom + 4 : 120, left: r ? r.left : 120 };
}

/** O topo do Mini-menu (para um painel que abre POR CIMA dele, sem o tapar). */
export function miniMenuTop(): number {
    const r = (document.querySelector('.tox-tinymce-aux .tox-pop') as HTMLElement | null)?.getBoundingClientRect();
    return r ? r.top - 4 : 120;
}

/**
 * Onde abrir um painel de `height` (px) junto ao Mini-menu, DECIDIDO UMA VEZ ao abrir: por baixo dele se cabe; senão por cima
 * (ancorado pelo FUNDO: o painel cresce para cima, nunca desce) quando por cima há mais espaço. `maxHeight` = o espaço do lado escolhido.
 */
export function placePanelBesideMiniMenu(height: number): { top?: number; bottom?: number; maxHeight: number } {
    const belowTop = miniMenuAnchor().top;
    const spaceBelow = window.innerHeight - belowTop - VIEWPORT_GAP;
    const aboveBottom = miniMenuTop();
    const spaceAbove = aboveBottom - VIEWPORT_GAP;
    if (height <= spaceBelow || spaceAbove <= spaceBelow) return { top: belowTop, maxHeight: spaceBelow };
    return { bottom: window.innerHeight - aboveBottom, maxHeight: spaceAbove };
}

const VIEWPORT_GAP = 8;
/**
 * `ref` de um painel `position:fixed` que abre para baixo a partir de `top`: se por baixo ficava cortado e por cima há mais espaço,
 * abre DE BAIXO PARA CIMA, a acabar em `aboveY` (por omissão o próprio `top`). Se nem assim cabe, usa o maior dos dois lados e
 * limita a altura (o painel precisa de `overflow-y-auto`). Idempotente: pode correr a cada render.
 */
export function openUpIfClipped(top: number, aboveY = top) {
    return (el: HTMLElement | null) => {
        if (!el) return;
        const h = el.scrollHeight;
        const below = window.innerHeight - top - VIEWPORT_GAP;
        const above = aboveY - VIEWPORT_GAP;
        if (h <= below || above <= below) { el.style.top = `${top}px`; return; }
        const fit = Math.min(h, above);
        el.style.top = `${aboveY - fit}px`;
        if (h > above) el.style.maxHeight = `${above}px`;
    };
}

/**
 * Ciclo de vida de um painel React aberto junto ao Mini-menu: enquanto `active`, fecha (`onClose`) ao
 * clicar fora, carregar Esc, fazer scroll (página ou editor) ou redimensionar a janela. O iframe do editor
 * não propaga cliques/teclas para a página — por isso ouve também o próprio editor. `isInside` diz se o
 * alvo pertence ao painel (clique/scroll lá dentro não fecha).
 */
export function usePopupDismiss(
    active: boolean,
    editorRef: React.MutableRefObject<TinyMCEEditor | null>,
    isInside: (target: Node) => boolean,
    onClose: () => void,
) {
    const latest = useLive({ isInside, onClose });
    useEffect(() => {
        if (!active) return;
        const editor = editorRef.current;
        const win = editor?.getWin();
        const close = () => latest.current.onClose();
        const outside = (e: Event) => !latest.current.isInside(e.target as Node);
        const onDown = (e: MouseEvent) => { if (outside(e)) close(); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
        const onScroll = (e: Event) => { if (outside(e)) close(); };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', close);
        win?.addEventListener('scroll', close);
        editor?.on('mousedown keydown', close);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', close);
            win?.removeEventListener('scroll', close);
            editor?.off('mousedown keydown', close);
        };
    }, [active, editorRef, latest]);
}
