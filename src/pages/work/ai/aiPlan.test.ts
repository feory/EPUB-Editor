import { test, expect } from 'bun:test';
import '../../../services/indesign/happy-dom'; // DOMParser no bun
import { runPlan, resolvePlan, validateOps, type BookOp } from './aiPlan';
import { planStyles } from '../../../utils/book-styles';
import type { BookRule } from '../../../utils/book-rules';

const ch = (title: string, body = '<p>Texto do capítulo.</p>', tag = 'h1') =>
    `<p class="chapter-break-${tag}" data-title="${title}"></p><${tag}>${title}</${tag}>${body}`;
const parts = [ch('Um'), ch('Dois'), ch('Três')];
const plan = (ops: BookOp[], rules: BookRule[] = [], p = parts) => runPlan(p, rules, ops);

test('drop_caps: aplica uma vez; a 2.ª corrida já não muda nada', () => {
    const first = plan([{ type: 'drop_caps' }]);
    expect(first.errors).toEqual([]);
    expect(first.opResults[0]).toMatchObject({ label: 'Capitulares', changed: true });
    expect(first.html).toContain('drop-cap');
    const again = plan([{ type: 'drop_caps' }], [], [first.html].flatMap((h) => h.split(/(?=<p class="chapter-break-h1")/)));
    expect(again.opResults[0].changed).toBe(false);
});

test('replace_text: conta ocorrências; sem ocorrências não muda', () => {
    const r = plan([{ type: 'replace_text', find: 'capítulo', replace: 'parte' }]);
    expect(r.opResults[0]).toMatchObject({ changed: true, summary: '3 ocorrências' });
    expect(r.html).toContain('Texto do parte.');
    expect(plan([{ type: 'replace_text', find: 'zzzz', replace: 'x' }]).opResults[0].changed).toBe(false);
});

test('replace_text: recusa marcação, aspas, atributos e texto novo com tags', () => {
    for (const find of ['<p>', 'class="x"', 'a=b', 'a&b', 'x']) {
        expect(validateOps([{ type: 'replace_text', find, replace: 'y' }]).length).toBe(1);
    }
    expect(validateOps([{ type: 'replace_text', find: 'ab', replace: '<b>' }]).length).toBe(1);
});

test('rename_chapter / set_chapter_level / hide_chapter mexem só no capítulo pedido', () => {
    const r = plan([
        { type: 'rename_chapter', index: 1, title: 'Segundo' },
        { type: 'set_chapter_level', index: 2, level: 'h2' },
        { type: 'hide_chapter', index: 0, hidden: true },
    ]);
    expect(r.errors).toEqual([]);
    expect(r.opResults.map((o) => o.changed)).toEqual([true, true, true]);
    expect(r.html).toContain('data-title="Segundo"');
    expect(r.html).toContain('chapter-break-h2');
});

test('hide_chapter é por estado, não alternância: pedir "escondido" duas vezes não volta a mostrar', () => {
    const once = plan([{ type: 'hide_chapter', index: 0, hidden: true }]);
    const split = once.html.split(/(?=<p class="chapter-break)/);
    const twice = plan([{ type: 'hide_chapter', index: 0, hidden: true }], [], split);
    expect(twice.opResults[0]).toMatchObject({ changed: false, summary: 'Já está escondido' });
    expect(twice.html).toBe(once.html);
});

test('índice de capítulo inexistente e operação inválida → erros, nada aplicado', () => {
    expect(plan([{ type: 'rename_chapter', index: 9, title: 'x' }]).errors[0]).toContain('não há capítulo 9');
    const bad = [
        { type: 'apagar_tudo' }, { type: 'set_chapter_level', index: 0, level: 'break' },
        { type: 'hide_chapter', index: 0, hidden: 'sim' }, { type: 'rename_chapter', index: 0.5, title: 'x' },
    ] as unknown as BookOp[];
    expect(validateOps(bad)).toHaveLength(4);
    expect(plan(bad).html).toBe(parts.join(''));
});

test('regras primeiro, operações depois, sobre o resultado das regras', () => {
    const rule: BookRule = { select: { tag: ['p'], afterHeading: ['h1'] }, action: { type: 'addClass', value: 'p-center' } };
    const r = plan([{ type: 'replace_text', find: 'Texto', replace: 'Corpo' }], [rule]);
    expect(r.html).toContain('<p class="p-center">Corpo do capítulo.</p>');
    expect(r.reports[0].changed).toBe(3);
});

test('link_index liga as entradas do Índice aos capítulos', () => {
    const toc = ch('Índice', '<p>Um fantasma assombra o mundo . . . . . 358</p>');
    const r = plan([{ type: 'link_index' }], [], [toc, ch('Um fantasma assombra o mundo')]);
    expect(r.opResults[0].changed).toBe(true);
    expect(r.html).toContain('idx-link');
});

test('regra inválida: erros das regras e nenhuma operação corre', () => {
    const bad: BookRule = { select: { tag: ['h2'] }, action: { type: 'delete' } };
    const r = plan([{ type: 'drop_caps' }], [bad]);
    expect(r.errors[0]).toContain('h1/h2');
    expect(r.opResults).toEqual([]);
});

const CSS = '/* === ESTILOS PERSONALIZADOS === */\n    .p-destaque { color: #555; }\n';
const newStyle = planStyles([{ name: 'Nota', props: { 'font-size': '0.9em' } }], CSS).planned;
const useNota: BookRule = { select: { tag: ['p'], afterHeading: ['h1'] }, action: { type: 'addClass', value: 'nota' } };

test('resolvePlan: HTML e CSS do mesmo plano saem juntos (a regra usa o estilo criado)', () => {
    const r = resolvePlan(parts, CSS, { rules: [useNota], ops: [], styles: newStyle, edits: [] });
    expect(r.errors).toEqual([]);
    expect(r.html).toContain('<p class="nota">');
    expect(r.css).toContain('.nota { font-size: 0.9em; }');
});

test('resolvePlan: erro no CSS (estilo já criado entretanto) → nada muda, nem o HTML', () => {
    const stale = `${CSS}    .nota { color: red; }\n`;
    const r = resolvePlan(parts, stale, { rules: [useNota], ops: [], styles: newStyle, edits: [] });
    expect(r.errors[0]).toContain('Já existe');
    expect(r.html).toBe(parts.join(''));
    expect(r.css).toBe(stale);
});

test('resolvePlan: erro no HTML (capítulo que já não existe) → o CSS também não muda', () => {
    const r = resolvePlan(parts, CSS, { rules: [], ops: [{ type: 'rename_chapter', index: 9, title: 'x' }], styles: newStyle, edits: [] });
    expect(r.errors[0]).toContain('não há capítulo 9');
    expect(r.css).toBe(CSS);
});

test('resolvePlan: só estilos (sem regras) deixa o HTML igual', () => {
    const r = resolvePlan(parts, CSS, { rules: [], ops: [], styles: newStyle, edits: [] });
    expect(r.html).toBe(parts.join(''));
    expect(r.css).not.toBe(CSS);
});
