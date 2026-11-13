import { test, expect } from 'bun:test';
import '../../../services/indesign/happy-dom'; // DOMParser no bun
import { runRules, blockKey, type BookRule } from '../../../utils/book-rules';
import { locateBlocks, scopeRules, blockContext } from './aiSelection';
import { selectedTopBlocks, type RangeLike } from '../editor/selectedBlock';
import { runAgent } from './aiAgent';
import { memoryWorkspace } from './testWorkspace';

const parts = [
    '<p class="chapter-break-h1" data-title="Um"></p><h1>Um</h1><p>igual</p><p>outro</p>',
    '<p class="chapter-break-h1" data-title="Dois"></p><h1>Dois</h1><p>igual</p><p>final</p><p>ultimo</p>',
];
const addCenter = (block?: BookRule['select']['block'], tag = ['p']): BookRule => ({ select: { tag, block }, action: { type: 'addClass', value: 'p-center' } });

test('regra com block: só esse bloco, mesmo havendo outros iguais', () => {
    const { parts: out, reports } = runRules(parts, [addCenter({ chapter: 1, index: 2, texts: ['igual'] })]);
    expect(out[0]).toBe(parts[0]);
    expect(out[1]).toContain('<p class="p-center">igual</p><p>final</p>');
    expect(reports[0].changed).toBe(1);
});

test('block com vários blocos seguidos: só esses, e a regra filtra por tag', () => {
    const block = { chapter: 1, index: 2, texts: ['igual', 'final'] };
    const { parts: out, reports } = runRules(parts, [addCenter(block)]);
    expect(out[1]).toContain('<p class="p-center">igual</p><p class="p-center">final</p><p>ultimo</p>');
    expect(reports[0].changed).toBe(2);
    expect(runRules(parts, [addCenter({ chapter: 1, index: 1, texts: ['Dois', 'igual'] })]).reports[0].changed).toBe(1); // o h1 não é "p"
});

test('block: se algum texto já não bate (o livro mudou) a regra não apanha nada', () => {
    const { reports, parts: out } = runRules(parts, [addCenter({ chapter: 1, index: 2, texts: ['igual', 'mudou'] })]);
    expect(reports[0].changed).toBe(0);
    expect(out).toEqual(parts);
});

test('block: tag diferente não apanha; block inválido é erro', () => {
    expect(runRules(parts, [addCenter({ chapter: 0, index: 2, texts: ['igual'] }, ['h3'])]).reports[0].changed).toBe(0);
    expect(runRules(parts, [addCenter({ chapter: -1, index: 0, texts: ['x'] })]).errors).toHaveLength(1);
    expect(runRules(parts, [addCenter({ chapter: 0, index: 0, texts: [] })]).errors).toHaveLength(1);
    expect(runRules(parts, [addCenter({ chapter: 0, index: 0, texts: Array(101).fill('x') })]).errors).toHaveLength(1);
});

const sel = (index: number, texts: string[], tags = texts.map(() => 'p')) => ({ index, tags, texts });

test('locateBlocks: capítulo ativo, posição certa', () => {
    expect(locateBlocks(parts, sel(2, ['igual', 'final']), 1)).toEqual({ chapter: 1, index: 2, texts: ['igual', 'final'] });
});

test('locateBlocks: posição errada mas sequência única → encontra; repetida → null', () => {
    expect(locateBlocks(parts, sel(0, ['final', 'ultimo']), 1)).toEqual({ chapter: 1, index: 3, texts: ['final', 'ultimo'] });
    expect(locateBlocks(parts, sel(0, ['igual']), -1)).toBeNull(); // dois "igual" no livro
});

test('locateBlocks: documento completo conta desde o início do livro', () => {
    expect(locateBlocks(parts, sel(6, ['igual', 'final']), -1)).toEqual({ chapter: 1, index: 2, texts: ['igual', 'final'] });
});

test('scopeRules fixa os blocos e larga capítulos/profundidade/afterHeading do modelo', () => {
    const block = { chapter: 0, index: 2, texts: ['igual'] };
    const [r] = scopeRules([{ select: { tag: ['p'], chapters: [5], deep: true, afterHeading: ['h1'], hasClass: ['a'] }, action: { type: 'delete' } }], block);
    expect(r.select).toEqual({ tag: ['p'], hasClass: ['a'], noClass: undefined, hasStyle: undefined, block });
});

test('blockContext mostra o HTML dos blocos e as tags', () => {
    const c = blockContext(parts, { chapter: 1, index: 3, texts: ['final', 'ultimo'] });
    expect(c).toContain('<p>final</p>');
    expect(c).toContain('<p>ultimo</p>');
    expect(c).toContain('2 blocos seguidos');
});

const body = new DOMParser().parseFromString('<p class="chapter-break-h1"></p><p id="a">  Olá   mundo </p><p id="b">dois</p><h3 id="c">T</h3><div class="box"><p id="d">x</p></div><p id="e"><img src="x"></p><p id="f"></p>', 'text/html').body;
const $ = (id: string) => body.querySelector(`#${id}`)!;
const caret = (n: Node): RangeLike => ({ startContainer: n, startOffset: 1, endContainer: n, endOffset: 1, collapsed: true });
const range = (a: Node, b: Node, endOffset = 1): RangeLike => ({ startContainer: a, startOffset: 0, endContainer: b, endOffset, collapsed: false });

test('selectedTopBlocks: um bloco; vários seguidos; mistura p e título', () => {
    expect(selectedTopBlocks(body, caret($('a').firstChild!))).toEqual({ index: 1, tags: ['p'], texts: ['Olá mundo'] });
    expect(selectedTopBlocks(body, range($('a').firstChild!, $('b').firstChild!))).toEqual({ index: 1, tags: ['p', 'p'], texts: ['Olá mundo', 'dois'] });
    expect(selectedTopBlocks(body, range($('a').firstChild!, $('c').firstChild!))?.tags).toEqual(['p', 'p', 'h3']);
});

test('selectedTopBlocks: o marcador de capítulo nas pontas da seleção não conta', () => {
    expect(selectedTopBlocks(body, range(body.children[0], $('b').firstChild!))?.texts).toEqual(['Olá mundo', 'dois']);
});

test('selectedTopBlocks: triplo clique (fim no início do bloco seguinte) não apanha esse bloco', () => {
    expect(selectedTopBlocks(body, range($('a').firstChild!, $('b').firstChild!, 0))?.texts).toEqual(['Olá mundo']);
});

test('selectedTopBlocks: caixa, marcador, imagem, vazio ou atravessar uma caixa → null', () => {
    expect(selectedTopBlocks(body, caret($('d').firstChild!))).toBeNull();
    expect(selectedTopBlocks(body, caret(body.children[0]))).toBeNull();
    expect(selectedTopBlocks(body, caret($('e')))).toBeNull();
    expect(selectedTopBlocks(body, caret($('f')))).toBeNull();
    expect(selectedTopBlocks(body, range($('c').firstChild!, $('e')))).toBeNull();
    expect(blockKey('  a  b ')).toBe('a b');
});

test('runAgent com scope: as regras ficam limitadas aos blocos e as operações são recusadas', async () => {
    const block = { chapter: 1, index: 2, texts: ['igual', 'final'] };
    const calls: string[] = [];
    let turn = 0;
    const rule = { select: { tag: ['p'], chapters: [0] }, action: { type: 'addClass', value: 'p-center' } };
    const send = async () => {
        turn++;
        if (turn === 1) return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'preview_rules', input: { rules: [rule], operations: [{ type: 'drop_caps' }] } }] };
        if (turn === 2) { calls.push('depois-ops'); return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't2', name: 'preview_rules', input: { rules: [rule] } }] }; }
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] };
    };
    const r = await runAgent({ messages: [], send, workspace: memoryWorkspace({ parts }), scope: block });
    expect(calls).toEqual(['depois-ops']);
    expect(r.proposal?.reports[0].changed).toBe(2);
    expect(r.proposal?.reports[0].chapters).toEqual([1]);
    expect(r.proposal?.rules[0].select.block).toEqual(block);
});
