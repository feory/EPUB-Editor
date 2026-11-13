// Classes que o editor entende (as do EPUB antigo passam intactas na importação; a IA só pode usar estas + os estilos do
// utilizador). Dono único da lista: epub-importer.ts e a IA importam daqui.
import { customStyleClasses } from './book-css';

export const EDITOR_CLASSES = new Set([
    'p-indent', 'p-non-indent', 'p-top', 'p-space', 'p-small', 'p-bold', 'p-italic', 'p-bold-italic', 'p-uppercase',
    'p-center', 'p-quote', 'p-legendas', 'footnote', 'footnote-ref', 'drop-cap', 'alinea',
    'chapter-break', 'small-caps', 'pagebreak', 'p-border-top', 'p-border-bottom', 'p-border-sides',
    'img-left', 'img-center', 'img-right', 'underline',
]);

// Têm semântica própria (notas, quebras, marcadores): acrescentá-las a um bloco por regra estraga o livro.
const NOT_FOR_RULES = new Set(['footnote', 'footnote-ref', 'pagebreak', 'chapter-break']);

/** Classes que uma regra da IA pode acrescentar: as do editor (menos as estruturais), os estilos do utilizador e `extra` (estilos a criar). */
export const classesForRules = (css: string, extra: string[] = []): Set<string> =>
    new Set([...[...EDITOR_CLASSES].filter((c) => !NOT_FOR_RULES.has(c)), ...customStyleClasses(css), ...extra]);
