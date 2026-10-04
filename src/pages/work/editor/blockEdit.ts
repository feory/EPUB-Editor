import type { TinyMCEEditor } from './types';

/**
 * Toda a edição feita pelos nossos menus/ações (estilos, pega, "+", divisória, gramática…)
 * passa por aqui: é um passo de undo próprio e o resto da app fica a saber.
 *
 * formatter.apply/toggle/remove e escritas diretas no DOM NÃO criam passo de undo (só o
 * execCommand cria) — sem isto Ctrl+Z não revertia a ação, ou revertia-a junto com a
 * escrita anterior. O passo de undo já emite 'change' (UndoManager → AddUndo + change), que é
 * o que o canal de conteúdo (contentChannel.ts) ouve; sem alteração real não há passo nem 'change'.
 * nodeChanged no fim: mini-menu, pega, anel e botões de estado reavaliam o bloco.
 *
 * O foco fica com quem chama: umas ações devem levá-lo ao editor (pega), outras não
 * (largura da divisória).
 */
export function editBlocks(editor: TinyMCEEditor, mutate: () => void): void {
    editor.undoManager.transact(mutate);
    editor.nodeChanged();
}
