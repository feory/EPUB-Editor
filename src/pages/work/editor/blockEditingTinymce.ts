import type { TinyMCEEditor } from './types';
import type { EditorLike } from './blockEditing';
import { editBlocks } from './blockEdit';
import { MARK } from './ephemeral';

/** Adapter TinyMCE do seam EditorLike (blockEditing.ts). */
export function tinymceEditorLike(editor: TinyMCEEditor): EditorLike {
    return {
        selectionNode: () => editor.selection.getNode(),
        // marcado por useBlockOverlays (data-mce-psbox) ao clicar na área da caixa/grelha
        selectedContainer: () => editor.getBody().querySelector(`[${MARK.box}]`) as HTMLElement | null,
        closest: (node, selector) => editor.dom.getParent(node, selector) as HTMLElement | null,
        setStyle: (el, name, value) => editor.dom.setStyle(el, name, value),
        setImportantStyle: (el, name, value) => {
            if (value) el.style.setProperty(name, value, 'important'); else el.style.removeProperty(name);
            // data-mce-style fora: o TinyMCE serializa-o de preferência ao style e ficava desatualizado.
            el.removeAttribute('data-mce-style');
            if (!el.getAttribute('style')) el.removeAttribute('style');
        },
        setAttrib: (el, name, value) => editor.dom.setAttrib(el, name, value),
        addClass: (el, cls) => editor.dom.addClass(el, cls),
        removeClass: (el, cls) => editor.dom.removeClass(el, cls),
        transact: (mutate) => editBlocks(editor, mutate),
        formatBlock: (tag) => editor.execCommand('FormatBlock', false, tag),
        applyFormat: (format) => editor.formatter.apply(format),
        selectedText: () => {
            if (editor.selection.isCollapsed()) return null;
            const node = editor.selection.getNode();
            return {
                // Só spans inline à volta da seleção: o style do próprio bloco é "Este bloco", não da seleção.
                read: (css) => {
                    for (let el: HTMLElement | null = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement; el && !editor.dom.isBlock(el); el = el.parentElement) {
                        const v = el.style.getPropertyValue(css);
                        if (v) return v;
                    }
                    return '';
                },
            };
        },
        applyInline: (format, value) => {
            if (value) editor.formatter.apply(format, { value });
            else editor.formatter.remove(format, { value: null }, undefined, true);
        },
    };
}
