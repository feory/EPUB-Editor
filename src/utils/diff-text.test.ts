import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import { extractParagraphs } from './diff-text';

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
