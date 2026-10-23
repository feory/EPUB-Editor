import type { TinyMCEEditor } from './types';
import type { EditorLike } from './blockEditing';
import { editBlocks } from './blockEdit';
import { MARK } from './ephemeral';
import { INLINE_FORMATS } from './selectionProps';

/** Adapter TinyMCE do seam EditorLike (blockEditing.ts). */
export function tinymceEditorLike(editor: TinyMCEEditor): EditorLike {
    // Só spans inline que tocam na seleção: o style do próprio bloco é "Este bloco", não da seleção. Depois de aplicar um
    // formato o getNode() sobe ao bloco (a seleção acaba fora do span), por isso parte-se do início da seleção e,
    // se não houver valor, procura-se nos spans que a intersetam.
    const readInline = (css: string): string => {
        const rng = editor.selection.getRng();
        const start = rng.startContainer;
        for (let el: HTMLElement | null = start.nodeType === 1 ? (start as HTMLElement) : start.parentElement; el && !editor.dom.isBlock(el); el = el.parentElement) {
            const v = el.style.getPropertyValue(css);
            if (v) return v;
        }
        const root = rng.commonAncestorContainer;
        const scope = (root.nodeType === 1 ? root : root.parentElement) as HTMLElement | null;
        for (const el of Array.from(scope?.querySelectorAll<HTMLElement>('span[style]') ?? [])) {
            if (!rng.intersectsNode(el)) continue;
            const v = el.style.getPropertyValue(css);
            if (v) return v;
        }
        return '';
    };
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
        selectedText: () => (editor.selection.isCollapsed() ? null : { read: readInline, formats: () => [...INLINE_FORMATS.map(([f]) => f as string), ...Object.keys(editor.formatter.get()).filter((f) => f.startsWith('c-'))].filter((f) => editor.formatter.match(f)) }),
        toggleInline: (format) => {
            // Estilo de caracteres acabado de criar: o CSS do livro só regista o formato no render seguinte.
            if (format.startsWith('c-') && !editor.formatter.has(format)) editor.formatter.register(format, { inline: 'span', classes: format });
            editor.formatter.toggle(format);
        },
        applyInline: (format, css, value) => {
            if (value) return editor.formatter.apply(format, { value });
            editor.formatter.remove(format, { value: null }, undefined, true);
            // Os formatos sem remove_similar (tamanho, família) só saem pelo valor exato que lá está.
            const current = readInline(css);
            if (current) editor.formatter.remove(format, { value: current });
        },
    };
}
