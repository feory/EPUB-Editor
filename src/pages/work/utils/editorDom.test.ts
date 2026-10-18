import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import { getNonEmptyBlocks } from './editorDom';
import { extractParagraphs } from '../../../utils/diff-text';

beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).document = new Window().document;
});

// Os índices do diff (extractParagraphs) têm de bater com os blocos do editor (getNonEmptyBlocks).
test('getNonEmptyBlocks bate com extractParagraphs (marcador de capítulo, vazios, nbsp)', () => {
    const html = '<p class="chapter-break-h1" data-title="A"></p><h1>A</h1><p>Um</p><p>&nbsp;</p><p></p><h2>Sub</h2><p>Dois</p>';
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(getNonEmptyBlocks(div).map(b => (b.textContent || '').trim())).toEqual(extractParagraphs(html));
});
