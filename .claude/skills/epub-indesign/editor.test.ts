// Correr: bun test ./.claude/skills/epub-indesign/
import { test, expect } from 'bun:test';
import { editorVocabulary } from './editor';

test('editorVocabulary: classes dos selectores, não de valores nem comentários', () => {
    const css = `/* .comentario */
p { font-size: 0.85em; }
.p-indent { text-indent: 2.15em !important; }
img.img-center, .p-top { margin: 1.5em auto; }
@font-face { src: url("Fonts/x.ttf"); }
table th, table td { border: 1px solid #333; }`;
    expect([...editorVocabulary(css)].sort()).toEqual(['img-center', 'p-indent', 'p-top']);
});

test('editorVocabulary: o DEFAULT_CSS real da app tem todas as classes que a tradução emite', async () => {
    const src = await Bun.file(new URL('../../../src/context/StyleContext.tsx', import.meta.url)).text();
    const vocab = editorVocabulary(src.match(/export const DEFAULT_CSS = `([\s\S]*?)`;/)![1]);
    for (const c of ['p-indent', 'p-top', 'p-space', 'p-bottom', 'p-center', 'p-small', 'p-legendas', 'p-quote',
        'p-bold', 'p-italic', 'p-bold-italic', 'p-uppercase', 'p-asterisk', 'p-border-top', 'p-border-bottom',
        'alinea', 'drop-cap', 'small-caps', 'footnote', 'footnotes-section']) expect(vocab.has(c)).toBe(true);
});
