/**
 * buildSections agora reusa matchChapterMarkerElement/CHAPTER_SPLIT_PATTERN de html-cleaner
 * em vez de reimplementar o regex — este teste tranca o comportamento observável.
 */
import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import { buildSections } from './chapters';

// decodeHtmlEntities (html-utils.ts) usa DOMParser global — não existe fora do browser.
beforeAll(() => {
    const win = new Window();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).DOMParser = win.DOMParser;
});

test('buildSections: capítulo h1 com título no marcador', () => {
    const html = '<p class="chapter-break-h1" data-title="Um">x</p><h1>Um</h1><p>corpo</p>';
    const sections = buildSections(html);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ title: 'Um', level: 'h1', parentIdx: -1 });
    expect(sections[0].content).toContain('<h1>Um</h1>');
    expect(sections[0].content).not.toContain('chapter-break'); // marcador removido do corpo exportado
});

test('buildSections: título ausente no marcador cai para o heading seguinte', () => {
    const html = '<p class="chapter-break-h1">x</p><h1>Do Heading</h1><p>corpo</p>';
    expect(buildSections(html)[0].title).toBe('Do Heading');
});

test('buildSections: h2 aninha em childIndices do h1 anterior', () => {
    const html = '<p class="chapter-break-h1" data-title="Cap 1">x</p><h1>Cap 1</h1>'
        + '<p class="chapter-break-h2" data-title="Sec 1.1">x</p><h2>Sec 1.1</h2>';
    const sections = buildSections(html);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({ level: 'h1', childIndices: [1] });
    expect(sections[1]).toMatchObject({ level: 'h2', parentIdx: 0, title: 'Sec 1.1' });
});

test('buildSections: marcador sem nível (chapter-break plano) vira quebra sem título', () => {
    const html = '<p class="chapter-break-h1" data-title="Cap 1">x</p><h1>Cap 1</h1>'
        + '<p class="chapter-break" data-title="Ficha">x</p><p>ficha técnica</p>';
    const sections = buildSections(html);
    expect(sections[1]).toMatchObject({ level: 'break', title: 'Ficha', parentIdx: 0 });
});

test('buildSections: [hidden] no título marca hiddenFromToc e é removido do título', () => {
    const html = '<p class="chapter-break-h1" data-title="Cap 1">x</p><h1>Cap 1</h1>'
        + '<p class="chapter-break" data-title="[hidden]Índice">x</p><p>índice</p>';
    const sections = buildSections(html);
    expect(sections[1]).toMatchObject({ title: 'Índice', hiddenFromToc: true });
});

test('buildSections: hr.chapter-break legacy vira quebra', () => {
    const html = '<p class="chapter-break-h1" data-title="Cap 1">x</p><h1>Cap 1</h1>'
        + '<hr class="chapter-break" data-title="Legacy">' + '<p>corpo</p>';
    const sections = buildSections(html);
    expect(sections[1]).toMatchObject({ level: 'break', title: 'Legacy' });
});

test('buildSections: notas de rodapé relocadas para footnotes-section no fim da secção', () => {
    const html = '<p class="chapter-break-h1" data-title="Cap 1">x</p><h1>Cap 1</h1>'
        + '<p>corpo<sup>1</sup></p><p class="footnote">1. nota</p>';
    const html2 = buildSections(html)[0].content;
    expect(html2).toContain('<div class="footnotes-section">');
    expect(html2.indexOf('footnotes-section')).toBeGreaterThan(html2.indexOf('corpo'));
});

test('buildSections: sem marcadores → secção única a partir do conteúdo', () => {
    const sections = buildSections('<p>sem marcadores</p>');
    expect(sections).toEqual([{ title: 'Secção 1', content: '<p>sem marcadores</p>', level: 'h1', parentIdx: -1, childIndices: [] }]);
});
