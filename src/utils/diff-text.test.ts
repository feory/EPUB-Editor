import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import { extractParagraphs, paragraphsOf, getNonEmptyBlocks } from './diff-text';

beforeAll(() => {
    const win = new Window();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).document = win.document;
});

test('extractParagraphs: apanha p/h1/h2/h3, ignora vazios', () => {
    const html = '<h1>Título</h1><p>Um</p><p>  </p><h2>Sub</h2><p></p><h3>H3</h3><div>ignorado</div>';
    expect(extractParagraphs(html)).toEqual(['Título', 'Um', 'Sub', 'H3']);
});

test('extractParagraphs: achata formatação inline', () => {
    expect(extractParagraphs('<p>a <em>b</em> <strong>c</strong></p>')).toEqual(['a b c']);
});

test('extractParagraphs: vazio', () => {
    expect(extractParagraphs('')).toEqual([]);
});

test('paragraphsOf: texto e formato (tag, classes por ordem, style) de cada parágrafo', () => {
    const html = '<h2 class="b a">Sub</h2><p class="p-indent" style="color:red">Um</p><p>Dois</p>';
    expect(paragraphsOf(html)).toEqual([
        { text: 'Sub', format: 'h2.a.b' },
        { text: 'Um', format: 'p.p-indent {color:red}' },
        { text: 'Dois', format: 'p' },
    ]);
});

test('paragraphsOf: o índice N é o N-ésimo bloco do editor (marcador de capítulo, vazios, nbsp ficam de fora)', () => {
    const html = '<p class="chapter-break-h1" data-title="A"></p><h1>A</h1><p>Um</p><p>&nbsp;</p><p></p><h2>Sub</h2><p class="x">Dois</p>';
    const div = document.createElement('div');
    div.innerHTML = html;
    const blocks = getNonEmptyBlocks(div);
    const paragraphs = paragraphsOf(html);
    expect(paragraphs.map(p => p.text)).toEqual(blocks.map(b => (b.textContent || '').trim()));
    expect(paragraphs[3].format).toBe('p.x');
    expect(blocks[3].className).toBe('x'); // mesmo bloco, mesmo índice
});
