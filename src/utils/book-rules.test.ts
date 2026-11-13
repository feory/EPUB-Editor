import { test, expect } from 'bun:test';
import '../services/indesign/happy-dom'; // DOMParser no bun
import { runRules, validateRules, type BookRule } from './book-rules';

const chapter = (title: string, body: string, tag = 'h1') =>
    `<p class="chapter-break-${tag}" data-title="${title}"></p><${tag}>${title}</${tag}>${body}`;

const firstAfterHeading: BookRule = {
    select: { tag: ['p'], afterHeading: ['h1', 'h2'] },
    action: { type: 'addClass', value: 'p-non-indent' },
};

test('afterHeading: só o 1.º parágrafo a seguir ao título, em todos os capítulos', () => {
    const parts = [chapter('Um', '<p>a</p><p>b</p>'), chapter('Dois', '<p>c</p><p>d</p>')];
    const { parts: out, reports } = runRules(parts, [firstAfterHeading]);
    expect(out[0]).toContain('<p class="p-non-indent">a</p><p>b</p>');
    expect(out[1]).toContain('<p class="p-non-indent">c</p><p>d</p>');
    expect(reports[0].changed).toBe(2);
    expect(reports[0].chapters).toEqual([0, 1]);
});

test('afterHeading: salta âncora, pagebreak e vazios entre o título e o parágrafo', () => {
    const parts = [chapter('Um', '<p class="chapter-anchor" id="idx-anchor-1"></p><p><span class="pagebreak" data-page="9"></span></p><hr><p>texto</p>')];
    const { parts: out } = runRules(parts, [firstAfterHeading]);
    expect(out[0]).toContain('<p class="p-non-indent">texto</p>');
});

test('afterHeading: h1 seguido de h2 — o parágrafo é o 1.º depois do h2, não do h1', () => {
    const parts = [chapter('Um', '<h2>Sub</h2><p>a</p>')];
    expect(runRules(parts, [firstAfterHeading]).parts[0]).toContain('<p class="p-non-indent">a</p>');
    const onlyH1: BookRule = { select: { tag: ['p'], afterHeading: ['h1'] }, action: { type: 'addClass', value: 'p-non-indent' } };
    expect(runRules(parts, [onlyH1]).reports[0].changed).toBe(0);
});

test('idempotente: 2.ª corrida não muda nada e devolve as mesmas strings', () => {
    const once = runRules([chapter('Um', '<p>a</p>')], [firstAfterHeading]).parts;
    const twice = runRules(once, [firstAfterHeading]);
    expect(twice.reports[0].changed).toBe(0);
    expect(twice.parts).toEqual(once);
});

test('partes sem alterações ficam intactas (mesma string, sem reserializar)', () => {
    const odd = '<p>a  <br>b</p>';
    const parts = [odd, chapter('Dois', '<p>c</p>')];
    expect(runRules(parts, [firstAfterHeading]).parts[0]).toBe(odd);
});

test('addClass p-indent tira p-non-indent (e vice-versa)', () => {
    const rule: BookRule = { select: { tag: ['p'] }, action: { type: 'addClass', value: 'p-indent' } };
    const { parts } = runRules(['<p class="p-non-indent p-small">a</p>'], [rule]);
    expect(parts[0]).toBe('<p class="p-small p-indent">a</p>');
});

test('removeClass tira o atributo class quando fica vazio', () => {
    const rule: BookRule = { select: { tag: ['p'], hasClass: ['p-small'] }, action: { type: 'removeClass', value: 'p-small' } };
    expect(runRules(['<p class="p-small">a</p><p>b</p>'], [rule]).parts[0]).toBe('<p>a</p><p>b</p>');
});

test('hasClass / noClass', () => {
    const rule: BookRule = { select: { tag: ['p'], hasClass: ['p-bold'], noClass: ['p-center'] }, action: { type: 'addClass', value: 'p-top' } };
    const { parts } = runRules(['<p class="p-bold">a</p><p class="p-bold p-center">b</p><p>c</p>'], [rule]);
    expect(parts[0]).toBe('<p class="p-bold p-top">a</p><p class="p-bold p-center">b</p><p>c</p>');
});

test('retag mantém classes e conteúdo (p-bold → h3)', () => {
    const rule: BookRule = { select: { tag: ['p'], hasClass: ['p-bold'] }, action: { type: 'retag', to: 'h3' } };
    const { parts, reports } = runRules(['<p class="p-bold">Título <em>x</em></p>'], [rule]);
    expect(parts[0]).toBe('<h3 class="p-bold">Título <em>x</em></h3>');
    expect(reports[0].samples[0].after).toBe('<h3 class="p-bold">Título <em>x</em></h3>');
});

test('delete apaga e o exemplo fica com "depois" vazio', () => {
    const rule: BookRule = { select: { tag: ['p'], hasClass: ['lixo'] }, action: { type: 'delete' } };
    const { parts, reports } = runRules(['<p class="lixo">x</p><p>y</p>'], [rule]);
    expect(parts[0]).toBe('<p>y</p>');
    expect(reports[0].samples[0]).toEqual({ chapter: 0, before: '<p class="lixo">x</p>', after: '' });
});

test('chapters / exceptChapters filtram por índice', () => {
    const parts = [chapter('Um', '<p>a</p>'), chapter('Índice', '<p>b</p>'), chapter('Três', '<p>c</p>')];
    const rule: BookRule = { select: { ...firstAfterHeading.select, exceptChapters: [1] }, action: firstAfterHeading.action };
    const { reports } = runRules(parts, [rule]);
    expect(reports[0].chapters).toEqual([0, 2]);
    const only = runRules(parts, [{ ...rule, select: { ...rule.select, exceptChapters: undefined, chapters: [1] } }]);
    expect(only.reports[0].chapters).toEqual([1]);
});

test('marcadores de capítulo e âncoras nunca são tocados', () => {
    const rule: BookRule = { select: { tag: ['p'] }, action: { type: 'addClass', value: 'p-center' } };
    const part = chapter('Um', '<p class="chapter-anchor" id="x"></p><p>a</p>');
    const { parts } = runRules([part], [rule]);
    expect(parts[0]).toContain('<p class="chapter-break-h1" data-title="Um"></p>');
    expect(parts[0]).toContain('<p class="chapter-anchor" id="x"></p>');
    expect(parts[0]).toContain('<p class="p-center">a</p>');
});

test('deep: por omissão ignora parágrafos em caixas; com deep entra', () => {
    const part = '<p>a</p><div class="box"><p>b</p></div>';
    const rule: BookRule = { select: { tag: ['p'] }, action: { type: 'addClass', value: 'p-small' } };
    expect(runRules([part], [rule]).parts[0]).toBe('<p class="p-small">a</p><div class="box"><p>b</p></div>');
    expect(runRules([part], [{ ...rule, select: { tag: ['p'], deep: true } }]).parts[0]).toBe('<p class="p-small">a</p><div class="box"><p class="p-small">b</p></div>');
});

test('as regras correm em sequência: a 2.ª vê o resultado da 1.ª', () => {
    const rules: BookRule[] = [
        { select: { tag: ['p'], hasClass: ['p-bold'] }, action: { type: 'retag', to: 'h3' } },
        { select: { tag: ['h3'] }, action: { type: 'addClass', value: 'p-center' } },
    ];
    expect(runRules(['<p class="p-bold">T</p>'], rules).parts[0]).toBe('<h3 class="p-bold p-center">T</h3>');
});

test('validação: devolve erros e não altera nada', () => {
    const parts = ['<p>a</p>'];
    const bad: BookRule[] = [
        { select: { tag: ['h2'] }, action: { type: 'delete' } },
        { select: { tag: ['p'] }, action: { type: 'retag', to: 'h2' } },
        { select: { tag: ['p'] }, action: { type: 'addClass', value: 'chapter-break-h1' } },
        { select: { tag: ['p'], deep: true, afterHeading: ['h1'] }, action: { type: 'addClass', value: 'p-small' } },
        { select: { tag: [] }, action: { type: 'addClass', value: 'p-small' } },
    ];
    const res = runRules(parts, bad);
    expect(res.errors).toHaveLength(5);
    expect(res.parts).toBe(parts);
});

test('validação: classe desconhecida só com catálogo', () => {
    const rule: BookRule = { select: { tag: ['p'] }, action: { type: 'addClass', value: 'p-inventada' } };
    expect(validateRules([rule])).toEqual([]);
    expect(validateRules([rule], new Set(['p-small']))).toEqual(['regra 1: classe desconhecida "p-inventada"']);
});

test('removeStyle: tira só as propriedades pedidas do style inline (caso do avanço por margin-left)', () => {
    const rule: BookRule = { select: { tag: ['p'], hasStyle: ['margin-left'] }, action: { type: 'removeStyle', props: ['margin-left'] } };
    const { parts, reports } = runRules(['<p style="margin-left: 2.15em;">a</p><p style="margin-left: 1em; color: red;">b</p><p>c</p>'], [rule]);
    expect(parts[0]).toBe('<p>a</p><p style="color: red;">b</p><p>c</p>');
    expect(reports[0].changed).toBe(2);
});

test('removeStyle: idempotente e hasStyle não apanha blocos sem essa propriedade', () => {
    const rule: BookRule = { select: { tag: ['p'] }, action: { type: 'removeStyle', props: ['text-indent'] } };
    const part = '<p style="margin-left: 2em;">a</p>';
    const res = runRules([part], [rule]);
    expect(res.reports[0].changed).toBe(0);
    expect(res.parts[0]).toBe(part);
    const only: BookRule = { select: { tag: ['p'], hasStyle: ['text-indent'] }, action: { type: 'addClass', value: 'p-small' } };
    expect(runRules([part], [only]).reports[0].changed).toBe(0);
});

test('removeStyle: propriedades inválidas → erro', () => {
    const bad = [
        { select: { tag: ['p'] }, action: { type: 'removeStyle', props: [] } },
        { select: { tag: ['p'] }, action: { type: 'removeStyle', props: ['margin-left: 1em'] } },
        { select: { tag: ['p'], hasStyle: ['Margin Left'] }, action: { type: 'delete' } },
    ] as unknown as BookRule[];
    expect(validateRules(bad).length).toBeGreaterThanOrEqual(3);
});
