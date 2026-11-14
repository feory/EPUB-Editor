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

test('set_image_alts: aplica num só passo, sem sobrepor alts escritos; items inválidos → erro', () => {
    const withImgs = [ch('Um', '<p><img data-image-id="a" src="/api/ebooks/1/images/a" alt="Imagem importada"></p><p><img data-image-id="b" src="/api/ebooks/1/images/b" alt="Já escrito"></p>')];
    const r = plan([{ type: 'set_image_alts', items: [{ id: 'a', alt: 'Um mapa' }, { id: 'b', alt: 'Outro' }] }], [], withImgs);
    expect(r.opResults[0]).toMatchObject({ label: 'Texto alternativo', changed: true, summary: '1 imagem' });
    expect(r.html).toContain('alt="Um mapa"');
    expect(r.html).toContain('alt="Já escrito"');
    const bad = [{ type: 'set_image_alts', items: [{ id: 'a', alt: '<b>x</b>' }] }, { type: 'set_image_alts', items: 'x' }] as unknown as BookOp[];
    expect(validateOps(bad)).toHaveLength(2);
});

test('set_image_alts com overwrite: edição posterior substitui um alt já escrito', () => {
    const written = [ch('Um', '<p><img data-image-id="a" src="/api/ebooks/1/images/a" alt="Texto antigo"></p>')];
    const r = plan([{ type: 'set_image_alts', items: [{ id: 'a', alt: 'Texto novo', overwrite: true }] }], [], written);
    expect(r.html).toContain('alt="Texto novo"');
    expect(plan([{ type: 'set_image_alts', items: [{ id: 'a', alt: 'Texto novo' }] }], [], written).opResults[0].changed).toBe(false);
    expect(validateOps([{ type: 'set_image_alts', items: [{ id: 'a', alt: 'x', overwrite: 'sim' as unknown as boolean }] }])).toHaveLength(1);
});

test('inline_style_to_class: validação (style, cls, scope) e conversão no plano', () => {
    const part = [ch('Um', '<p>x</p>').replace('<h1>Um</h1>', '<h1>Um <span style="color: red;">1</span></h1>')];
    const ok = plan([{ type: 'inline_style_to_class', style: { color: 'red' }, cls: 'c-vermelho', scope: ['h1'] }], [], part);
    expect(ok.errors).toEqual([]);
    expect(ok.html).toContain('<span class="c-vermelho">1</span>');
    const bad = [
        { type: 'inline_style_to_class', style: {}, cls: 'c-x' },
        { type: 'inline_style_to_class', style: { color: '<b>' }, cls: 'c-x' },
        { type: 'inline_style_to_class', style: { color: 'red' }, cls: 'Mau Nome' },
        { type: 'inline_style_to_class', style: { color: 'red' }, cls: 'c-x', scope: 'h1' },
    ] as unknown as BookOp[];
    expect(validateOps(bad)).toHaveLength(4);
});

test('operação typography: resumo com contagens e exemplo; fixes inválidos recusados', async () => {
    const ok = runPlan(['<p>Disse "olá"...</p>'], [], [{ type: 'typography' }]);
    expect(ok.errors).toEqual([]);
    expect(ok.opResults[0]).toMatchObject({ label: 'Tipografia', changed: true });
    expect(ok.opResults[0].summary).toContain('aspas 2');
    expect(ok.opResults[0].summary).toContain('reticências 1');
    expect(ok.html).toBe('<p>Disse «olá»…</p>');
    expect(runPlan(['<p>a</p>'], [], [{ type: 'typography', fixes: ['nada' as never] }]).errors).toHaveLength(1);
    expect(runPlan(['<p>limpo</p>'], [], [{ type: 'typography' }]).opResults[0]).toMatchObject({ changed: false, summary: 'Nada a corrigir' });
});

test('plano com style_deletes: apaga o estilo sem uso; um em uso (depois das regras do plano) recusa o plano', () => {
    const css = '/* === ESTILOS PERSONALIZADOS === */\n    .p-velho { color: red; }\n    .p-usado { color: blue; }\n/* === EDITOR (não exportado para EPUB) === */\n';
    const book = ['<p class="p-usado">a</p>'];
    const ok = resolvePlan(book, css, { rules: [], ops: [], styles: [], edits: [], removals: ['p-velho'] });
    expect(ok.errors).toEqual([]);
    expect(ok.css).not.toContain('.p-velho');
    expect(ok.html).toBe(book[0]);
    const inUse = resolvePlan(book, css, { rules: [], ops: [], styles: [], edits: [], removals: ['p-usado'] });
    expect(inUse.errors[0]).toContain('está em uso');
    expect(inUse.css).toBe(css); // nada muda
    // "tira a classe e apaga o estilo" num só plano
    const both = resolvePlan(book, css, { rules: [{ select: { tag: ['p'] }, action: { type: 'removeClass', value: 'p-usado' } }], ops: [], styles: [], edits: [], removals: ['p-usado'] });
    expect(both.errors).toEqual([]);
    expect(both.css).not.toContain('.p-usado');
    expect(both.html).toBe('<p>a</p>');
});
