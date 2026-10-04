import type { TinyMCEEditor } from './types';

/**
 * Espaço útil para overlays fixos (pega, caixa de editar HTML) em coords da janela: ENTRE o
 * fundo da barra de ferramentas e o topo da barra de estado do TinyMCE. Os overlays pintavam
 * por cima das duas (sem z-index próprio, só ordem no DOM) — em vez de uma guerra de z-index
 * com o skin, cada overlay limita-se a este espaço.
 */
const GAP = 8;
export function chromeBounds(editor: TinyMCEEditor): { minTop: number; maxBottom: number } {
    const container = editor.getContainer() as HTMLElement | null;
    const header = container?.querySelector('.tox-editor-header') as HTMLElement | null;
    const statusbar = container?.querySelector('.tox-statusbar') as HTMLElement | null;
    const minTop = header ? header.getBoundingClientRect().bottom + GAP : 0;
    const maxBottom = statusbar ? statusbar.getBoundingClientRect().top - GAP : window.innerHeight;
    return { minTop, maxBottom };
}
