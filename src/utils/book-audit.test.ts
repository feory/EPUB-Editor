import { test, expect } from 'bun:test';
import '../services/indesign/happy-dom'; // DOMParser no bun
import { auditBook } from './book-audit';
import { surveyBook } from './book-survey';

const chapter = (title: string, body: string, tag = 'h1') => `<p class="chapter-break-${tag}" data-title="${title}"></p><${tag}>${title}</${tag}>${body}`;
const css = '/* === ESTILOS PERSONALIZADOS === */\n.usado { color: red; }\n.uma-vez { color: blue; }\n.nunca { color: green; }\n';

test('títulos que saltam de nível: h1 → h3 sim; h1 → h2 → h3 e descer não', () => {
    const jump = auditBook([chapter('Um', '<h3>Salto</h3>')]).headingJumps;
    expect(jump).toEqual([{ chapter: 0, from: 'h1', to: 'h3', text: 'Salto' }]);
    expect(auditBook([chapter('Um', '<h2>a</h2><h3>b</h3><h1>c</h1><h2>d</h2>')]).headingJumps).toEqual([]);
});

test('o nível continua entre capítulos (h2 de um capítulo e h4 do seguinte)', () => {
    expect(auditBook([chapter('A', '', 'h2'), chapter('B', '<h4>x</h4>', 'h2')]).headingJumps).toHaveLength(1);
});

test('style inline isolado: só se os dois vizinhos não o têm', () => {
    const odd = '<p>a</p><p style="margin-left: 2em;">b</p><p>c</p>';
    expect(auditBook([chapter('Um', odd)]).inlineStyleOutliers).toEqual([{ chapter: 0, index: 3, text: 'b', style: 'margin-left: 2em;' }]);
    expect(auditBook([chapter('Um', '<p style="x:1">a</p><p style="x:1">b</p><p>c</p>')]).inlineStyleOutliers).toEqual([]); // sequência, não isolado
    expect(auditBook([chapter('Um', '<p>a</p><p style="x:1">b</p>')]).inlineStyleOutliers).toEqual([]); // sem vizinho seguinte
});

test('estilos do utilizador: sem uso e usados uma só vez', () => {
    const a = auditBook([chapter('Um', '<p class="usado">1</p><p class="usado">2</p><p><span class="uma-vez">x</span></p>')], css);
    expect(a.styleUsage).toEqual({ unused: ['nunca'], usedOnce: ['uma-vez'] });
});

test('as listas são cortadas e dizem quantas ficaram de fora', () => {
    const many = Array.from({ length: 15 }, () => '<p>a</p><p style="x:1">b</p><p>c</p>').join('');
    const a = auditBook([chapter('Um', many)]);
    expect(a.inlineStyleOutliers).toHaveLength(12);
    expect(a.omitted.inlineStyleOutliers).toBe(3);
});

test('o survey_book traz o audit', () => {
    expect(surveyBook([chapter('Um', '<h3>x</h3>')]).audit.headingJumps).toHaveLength(1);
});
