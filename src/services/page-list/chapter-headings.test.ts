import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
(globalThis as { NodeFilter?: unknown }).NodeFilter ??= { SHOW_TEXT: 4 };
const { insertChapterHeadings } = await import('./page-list');

test('insertChapterHeadings: âncora também no Índice (1.ª ocorrência fora de ordem) é reencontrada no corpo', () => {
    const [a, b, c] = ['capitulo1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'capitulo2yyyyyyyyyyyyyyyyyyyyyyyyyyyyyy', 'capitulo3zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'];
    // O Índice lista só o 3.º título, antes do corpo (1.º, 2.º, 3.º).
    const html = [c, a, b, c].map(t => `<p>${t}</p>`).join('');
    const res = insertChapterHeadings(html, [a, b, c].map((anchor, i) => ({ anchor, headingHtml: `<h1>H${i + 1}</h1>` })));
    expect(res.inserted).toBe(3);
    expect(res.html).toBe(`<p>${c}</p><h1>H1</h1><p>${a}</p><h1>H2</h1><p>${b}</p><h1>H3</h1><p>${c}</p>`);
});
