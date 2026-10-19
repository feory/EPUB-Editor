/**
 * buildSections reusa classifyChapterPart (a regra de nível/título do editor) em vez de a reimplementar —
 * este teste tranca o comportamento observável.
 */
import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import { buildSections } from './chapters';
import { insertChapterMarkers, splitChapterSegments, classifyChapterPart, stripHidden } from '../../../utils/chapters';

// insertChapterMarkers (o limpador de HTML) usa DOMParser global — não existe fora do browser.
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

test('buildSections: marcador sem nível (chapter-break plano) com título (Ficha Técnica) é um h1', () => {
    const html = '<p class="chapter-break-h1" data-title="Cap 1">x</p><h1>Cap 1</h1>'
        + '<p class="chapter-break" data-title="Ficha">x</p><p>ficha técnica</p>';
    const sections = buildSections(html);
    expect(sections[1]).toMatchObject({ level: 'h1', title: 'Ficha', parentIdx: -1 });
    expect(sections[0].childIndices).toEqual([]);
});

test('buildSections: [hidden] no título continua quebra escondida, marca hiddenFromToc e é removido do título', () => {
    const html = '<p class="chapter-break-h1" data-title="Cap 1">x</p><h1>Cap 1</h1>'
        + '<p class="chapter-break" data-title="[hidden]Índice">x</p><p>índice</p>';
    const sections = buildSections(html);
    expect(sections[1]).toMatchObject({ level: 'break', title: 'Índice', hiddenFromToc: true });
});

test('buildSections: hr.chapter-break legacy vira h1', () => {
    const html = '<p class="chapter-break-h1" data-title="Cap 1">x</p><h1>Cap 1</h1>'
        + '<hr class="chapter-break" data-title="Legacy">' + '<p>corpo</p>';
    const sections = buildSections(html);
    expect(sections[1]).toMatchObject({ level: 'h1', title: 'Legacy' });
});

test('buildSections: notas de rodapé relocadas para footnotes-section no fim da secção', () => {
    const html = '<p class="chapter-break-h1" data-title="Cap 1">x</p><h1>Cap 1</h1>'
        + '<p>corpo<sup>1</sup></p><p class="footnote">1. nota</p>';
    const html2 = buildSections(html)[0].content;
    expect(html2).toContain('<div class="footnotes-section">');
    expect(html2.indexOf('footnotes-section')).toBeGreaterThan(html2.indexOf('corpo'));
});

test('buildSections: sem marcadores → um h1 sem título', () => {
    const sections = buildSections('<p>sem marcadores</p>');
    expect(sections).toEqual([{ title: 'Sem Título 1', content: '<p>sem marcadores</p>', level: 'h1', parentIdx: -1, childIndices: [] }]);
});

test('buildSections: quebra sem título é um h1, não filha do h1 anterior', () => {
    const html = '<p class="chapter-break-h1" data-title="Cap 1">x</p><h1>Cap 1</h1><p>a</p>'
        + '<p class="chapter-break">x</p><p>b</p>'
        + '<hr class="chapter-break"><p>c</p>';
    const sections = buildSections(html);
    expect(sections.map(s => [s.level, s.parentIdx, s.title])).toEqual([['h1', -1, 'Cap 1'], ['h1', -1, 'Sem Título 2'], ['h1', -1, 'Sem Título 3']]);
    expect(sections[0].childIndices).toEqual([]);
});

test('buildSections: chamada de nota no heading não entra no título do capítulo', () => {
    const sections = buildSections(insertChapterMarkers('<h1>SEGUNDA PARTE<br>O VIAJANTE E A SUA SOMBRA(<sup>143</sup>)</h1><p>corpo</p>'));
    expect(sections[0].title).toBe('SEGUNDA PARTE O VIAJANTE E A SUA SOMBRA');
});

test('buildSections e a barra lateral concordam: mesmo nível e título por parte (uma só regra)', () => {
    const html = '<p class="chapter-break" data-title="Frontespício"></p><p>f</p>'
        + '<p class="chapter-break-h1" data-title="Cap 1"></p><h1>Cap 1</h1><p>a</p>'
        + '<p class="chapter-break-h2" data-title="Sec"></p><h2>Sec</h2><p>b</p>'
        + '<p class="chapter-break">x</p><p>c</p>'
        + '<p class="chapter-break" data-title="[hidden]Oculta"></p><p>d</p>';
    const sections = buildSections(html);
    const editor = splitChapterSegments(html).filter(p => p.trim()).map((p, i) => classifyChapterPart(p, i));
    expect(sections.map(s => [s.level, s.title])).toEqual(editor.map(c => [c.level, stripHidden(c.title)]));
});
