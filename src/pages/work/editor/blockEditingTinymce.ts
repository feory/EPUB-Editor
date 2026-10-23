import type { TinyMCEEditor } from './types';
import type { EditorLike } from './blockEditing';
import { editBlocks } from './blockEdit';
import { MARK } from './ephemeral';
import { INLINE_FORMATS } from './selectionProps';
import { isCharStyle } from '../../../utils/char-styles';
import { readInlineStyle, setInlineFormat } from './selectionFormats';
import { ensureCharStyleFormat, registeredCharStyles } from './formats';

/** Adapter TinyMCE do seam EditorLike (blockEditing.ts). */
export function tinymceEditorLike(editor: TinyMCEEditor): EditorLike {
    const readInline = (css: string): string => readInlineStyle(editor.selection.getRng(), (el) => editor.dom.isBlock(el), css);
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
        selectedText: () => (editor.selection.isCollapsed() ? null : { read: readInline, formats: () => [...INLINE_FORMATS.map(([f]) => f as string), ...registeredCharStyles(editor)].filter((f) => editor.formatter.match(f)) }),
        toggleInline: (format) => {
            // Estilo de caracteres acabado de criar: o CSS do livro só regista o formato no render seguinte.
            if (isCharStyle(format)) ensureCharStyleFormat(editor, format);
            editor.formatter.toggle(format);
        },
        applyInline: (format, css, value) => setInlineFormat(editor.formatter, readInline, format, css, value),
    };
}
