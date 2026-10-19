import type { Editor } from 'tinymce';
import { styleFormatsWith } from './config';

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
    });
}

// Estilos personalizados do livro (utils/custom-styles): registam-se como os de parágrafo e entram no
// menu "Formats" → "Parágrafos". O TinyMCE só lê `style_formats` no arranque; `addStyleModifications`
// (replace) refaz a lista, lida de novo cada vez que o menu abre.
export function syncCustomStyleFormats(editor: Editor, custom: string[]) {
    custom.forEach((c) => { if (!editor.formatter.has(c)) editor.formatter.register(c, { selector: 'p,li', classes: c }); });
    (editor as unknown as { dispatch(name: string, args: object): void })
        .dispatch('addStyleModifications', { items: styleFormatsWith(custom), replace: true });
}
