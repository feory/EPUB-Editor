import { useEffect } from 'react';
import type { TinyMCEEditor } from '../types';
import { useLive } from '../liveProps';

/** Posição para um painel React logo abaixo do pop do Mini-menu (coords da janela, para `position: fixed`). */
export function miniMenuAnchor(): { top: number; left: number } {
    const r = (document.querySelector('.tox-tinymce-aux .tox-pop') as HTMLElement | null)?.getBoundingClientRect();
    return { top: r ? r.bottom + 4 : 120, left: r ? r.left : 120 };
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
