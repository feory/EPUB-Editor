import type { Editor } from 'tinymce';
import { styleFormatsWith } from './config';
import { charFormats } from './selectionProps';
import { isCharStyle, charStyleFormat } from '../../../utils/char-styles';

// Formatos de parágrafo/inline do editor (classes do livro). Registados no init do editor.
export function registerBlockFormats(editor: Editor) {
    editor.on('init', () => {
        // selector (não block): aplica a classe ao bloco existente sem lhe trocar a tag —
        // block:'p' não fazia nada dentro de um <li> (o TinyMCE não troca a tag de um item
        // de lista por um <p>, quebraria a lista), impossibilitando estilo de parágrafo em
        // bullets. selector:'p,li' cobre ambos.
        editor.formatter.register('p-indent', { selector: 'p,li', classes: 'p-indent' });
        editor.formatter.register('p-top', { selector: 'p,li', classes: 'p-top' });
        editor.formatter.register('p-space', { selector: 'p,li', classes: 'p-space' });
        editor.formatter.register('footnote', { selector: 'p,li', classes: 'footnote' });
        editor.formatter.register('drop-cap', { selector: 'p,li', classes: 'drop-cap' });
        editor.formatter.register('p-small', { selector: 'p,li', classes: 'p-small' });
        editor.formatter.register('p-legendas', { selector: 'p,li', classes: 'p-legendas' });
        editor.formatter.register('p-bold', { selector: 'p,li', classes: 'p-bold' });
        editor.formatter.register('p-italic', { selector: 'p,li', classes: 'p-italic' });
        editor.formatter.register('p-bold-italic', { selector: 'p,li', classes: 'p-bold-italic' });
        editor.formatter.register('p-uppercase', { selector: 'p,li', classes: 'p-uppercase' });
        editor.formatter.register('p-quote', { selector: 'p,li', classes: 'p-quote' });
        editor.formatter.register('p-asterisk', { selector: 'p,li', classes: 'p-asterisk' });
        editor.formatter.register('p-border-top', { selector: 'p,li', classes: 'p-border-top' });
        editor.formatter.register('p-border-bottom', { selector: 'p,li', classes: 'p-border-bottom' });
        editor.formatter.register('p-border-sides', { selector: 'p,li', classes: 'p-border-sides' });
        editor.formatter.register('small-text', { inline: 'small' });
        // Override do formato nativo (senão sai <span style="text-decoration:underline">) —
        // <u> é o que o import de EPUB já produz (reverseUnderline), consistente e sem CSS.
        editor.formatter.register('underline', { inline: 'u' });
        editor.formatter.register('small-caps', { inline: 'span', classes: 'small-caps' });
        // Reusa a classe do formato de parágrafo p-uppercase (CSS já existe, sem seletor de
        // tag — ver StyleContext.tsx) num <span> inline, para poder aplicar-se a uma SELEÇÃO
        // dentro de um título (p-uppercase de bloco é removido de headings — ver PARA_STYLE_CLASSES).
        editor.formatter.register('uppercase', { inline: 'span', classes: 'p-uppercase' });
        editor.formatter.register('box', { block: 'div', classes: 'box', wrapper: true });
        // Personalização da seleção/estilo de caracteres: os formatos vêm da tabela em selectionProps.ts (cor, fundo, tamanho e família usam os nativos).
        charFormats().forEach(({ name, styles }) => editor.formatter.register(name, { inline: 'span', styles, remove_similar: true }));
    });
}

/** Regista o formato de um estilo de caracteres (se ainda não existe): o nome do formato é a própria classe. */
export function ensureCharStyleFormat(editor: Editor, cls: string) {
    if (!editor.formatter.has(cls)) editor.formatter.register(cls, charStyleFormat(cls));
}

/**
 * Ao tirar um estilo de caracteres, o texto pode ter, além da classe, as mesmas propriedades como `style` inline (o estilo foi
 * criado a partir da seleção): sem as limpar o aspeto ficava. Só se tiram as que valem o mesmo que na classe (diferentes = edição do utilizador).
 */
function clearInlineDuplicates(editor: Editor, cls: string) {
    const rule = [...editor.getDoc().styleSheets].flatMap((sheet) => [...sheet.cssRules]).find((r): r is CSSStyleRule => (r as CSSStyleRule).selectorText === `.${cls}`);
    if (!rule) return;
    const rng = editor.selection.getRng();
    (editor.dom.select(`span.${cls}`) as HTMLElement[]).filter((el) => rng.intersectsNode(el)).forEach((el) => {
        for (const prop of rule.style) if (el.style.getPropertyValue(prop) === rule.style.getPropertyValue(prop)) el.style.removeProperty(prop);
        el.removeAttribute('data-mce-style');
        if (!el.getAttribute('style')) el.removeAttribute('style');
    });
}

/** Liga/desliga um estilo de caracteres (ao desligar, limpa também o inline que duplica a classe). */
export function toggleCharStyle(editor: Editor, cls: string) {
    ensureCharStyleFormat(editor, cls);
    if (editor.formatter.match(cls)) clearInlineDuplicates(editor, cls);
    editor.formatter.toggle(cls);
}

/** Estilos de caracteres já registados no editor (nomes dos formatos). */
export const registeredCharStyles = (editor: Editor): string[] => Object.keys(editor.formatter.get()).filter(isCharStyle);

// Estilos personalizados do livro (utils/custom-styles): registam-se como os de parágrafo e entram no
// menu "Formats" → "Parágrafos". O TinyMCE só lê `style_formats` no arranque; `addStyleModifications`
// (replace) refaz a lista, lida de novo cada vez que o menu abre.
export function syncCustomStyleFormats(editor: Editor, custom: string[], charStyles: string[] = []) {
    registeredCharStyles(editor).filter((c) => !charStyles.includes(c)).forEach((c) => editor.formatter.unregister(c)); // estilo apagado
    charStyles.forEach((c) => ensureCharStyleFormat(editor, c));
    custom.forEach((c) => { if (!editor.formatter.has(c)) editor.formatter.register(c, { selector: 'p,li', classes: c }); });
    (editor as unknown as { dispatch(name: string, args: object): void })
        .dispatch('addStyleModifications', { items: styleFormatsWith(custom), replace: true });
}
