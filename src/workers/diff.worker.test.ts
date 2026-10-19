import { test, expect } from 'bun:test';
import { diffParagraphs } from './diff.worker';

test('mesmo texto, formatação diferente → item "format" (não "equal")', () => {
    const items = diffParagraphs(['A', 'B'], ['A', 'B'], ['p', 'p.p-indent-v2'], ['p', 'p']);
    expect(items.map(i => i.type)).toEqual(['equal', 'format']);
    expect(items[1]).toMatchObject({ editorIndex: 1, editorFormat: 'p.p-indent-v2', refFormat: 'p' });
});

test('sem formatos (comparação com ficheiro) o diff é só de texto', () => {
    expect(diffParagraphs(['A'], ['A']).map(i => i.type)).toEqual(['equal']);
});
