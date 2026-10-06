import type { TinyMCEEditor } from './types';
import type { EditorLike } from './blockEditing';
import { editBlocks } from './blockEdit';

/** Adapter TinyMCE do seam EditorLike (blockEditing.ts). */
export function tinymceEditorLike(editor: TinyMCEEditor): EditorLike {
    return {
        selectionNode: () => editor.selection.getNode(),
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
    };
}
