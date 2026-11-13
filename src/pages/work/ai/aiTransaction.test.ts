import { test, expect } from 'bun:test';
import '../../../services/indesign/happy-dom'; // DOMParser no bun
import { createAiTransactions, type AiHistoryPort, type AiBookPort } from './aiTransaction';
import type { AiPlanInput } from './aiPlan';
import { planStyles } from '../../../utils/book-styles';
import type { BookRule } from '../../../utils/book-rules';

const ch = (title: string, body: string) => `<p class="chapter-break-h1" data-title="${title}"></p><h1>${title}</h1>${body}`;
const BOOK = ch('Um', '<p>a</p><p>b</p>');
const CSS = '/* === ESTILOS PERSONALIZADOS === */\n    .p-destaque { color: #555; }\n';

const noIndent: BookRule = { select: { tag: ['p'], afterHeading: ['h1'] }, action: { type: 'addClass', value: 'p-non-indent' } };
const htmlPlan: AiPlanInput = { rules: [noIndent], ops: [], styles: [], edits: [] };
const newStyle = planStyles([{ name: 'Nota', props: { 'font-size': '0.9em' } }], CSS).planned;
const cssPlan: AiPlanInput = { rules: [], ops: [], styles: newStyle, edits: [] };
const both: AiPlanInput = { ...htmlPlan, styles: newStyle };

/** Tudo em memória; `log` guarda a ORDEM das chamadas, que é o que a transação garante. `fail` faz uma operação rejeitar. */
function setup(opts: { html?: string; css?: string; fail?: string[]; saveHtmlReturns?: string | undefined } = {}) {
    const log: string[] = [];
    const state = { html: opts.html ?? BOOK, css: opts.css ?? CSS };
    const store: Record<string, string> = { 'content_antes.html.gz': BOOK, 'style_antes.css': CSS };
    let n = 0; // cada versão guardada tem nome novo, como no servidor
    const maybeFail = (name: string) => { if (opts.fail?.includes(name)) throw new Error(`${name} falhou`); };
    const history: AiHistoryPort = {
        saveHtml: async (html) => { log.push('saveHtml'); maybeFail('saveHtml'); const f = `content_${++n}.html.gz`; store[f] = html; return 'saveHtmlReturns' in opts ? opts.saveHtmlReturns : f; },
        labelHtml: async (f, label) => { log.push(`labelHtml:${f}:${label}`); maybeFail('labelHtml'); },
        saveCss: async (css, label) => { log.push(`saveCss:${label}`); maybeFail('saveCss'); const f = `style_${++n}.css`; store[f] = css; return f; },
        readHtml: async (f) => { log.push(`readHtml:${f}`); maybeFail('readHtml'); return store[f]; },
        readCss: async (f) => { log.push(`readCss:${f}`); maybeFail('readCss'); return store[f]; },
        record: async (e) => { log.push(`record:${JSON.stringify(e)}`); maybeFail('record'); },
        markReverted: async (id) => { log.push(`markReverted:${id}`); maybeFail('markReverted'); },
    };
    const book: AiBookPort = {
        parts: () => state.html.split(/(?=<p class="chapter-break)/),
        html: () => state.html,
        commit: (html, mode) => { log.push(`commit:${mode}`); state.html = html; },
    };
    const css = { get: () => state.css, set: (next: string) => { log.push('css.set'); state.css = next; } };
    return { tx: createAiTransactions({ history, book }), css, log, state };
}

// ---- aplicar ----

test('aplicar: guarda as versões anteriores (HTML e CSS), só depois altera, e regista no fim', async () => {
    const { tx, css, log, state } = setup();
    const r = await tx.apply(both, 'faz isto', css, ['Regra 1: 1 bloco']);
    expect(r).toEqual({ status: 'applied', snapshots: { htmlFile: 'content_1.html.gz', cssFile: 'style_2.css' } });
    expect(log.map((l) => l.split(':')[0])).toEqual(['saveHtml', 'labelHtml', 'saveCss', 'css.set', 'commit', 'record']);
    expect(log[1]).toContain('Antes de IA: faz isto');
    expect(log.at(-1)).toContain('"lines":["Regra 1: 1 bloco"]');
    expect(state.html).toContain('p-non-indent');
    expect(state.css).toContain('.nota');
});

test('aplicar: só o que mudou — plano só de CSS não guarda nem altera o HTML', async () => {
    const { tx, css, log } = setup();
    expect((await tx.apply(cssPlan, 'x', css)).status).toBe('applied');
    expect(log.map((l) => l.split(':')[0])).toEqual(['saveCss', 'css.set', 'record']);
});

test('aplicar: plano só de HTML não guarda nem altera o CSS', async () => {
    const { tx, css, log } = setup();
    await tx.apply(htmlPlan, 'x', css);
    expect(log.map((l) => l.split(':')[0])).toEqual(['saveHtml', 'labelHtml', 'commit', 'record']);
});

test('aplicar: sem efeito → nothing, sem uma única chamada; plano inválido → erros, sem tocar em nada', async () => {
    const a = setup({ html: BOOK.replace('<p>a</p>', '<p class="p-non-indent">a</p>') });
    expect((await a.tx.apply(htmlPlan, 'x', a.css)).status).toBe('nothing');
    expect(a.log).toEqual([]);

    const bad: AiPlanInput = { ...htmlPlan, rules: [{ select: { tag: ['h2'] }, action: { type: 'delete' } }] };
    const b = setup();
    const r = await b.tx.apply(bad, 'x', b.css);
    expect(r.status).toBe('invalid');
    expect(r.status === 'invalid' && r.errors[0]).toContain('h1/h2');
    expect(b.log).toEqual([]);
});

test('aplicar é tudo-ou-nada: se gravar o CSS anterior falha, nem o HTML nem o CSS são tocados', async () => {
    const { tx, css, log, state } = setup({ fail: ['saveCss'] });
    await expect(tx.apply(both, 'x', css)).rejects.toThrow('saveCss falhou');
    expect(log.some((l) => l === 'commit:keep' || l === 'css.set')).toBe(false);
    expect(log.some((l) => l.startsWith('record'))).toBe(false);
    expect(state.html).toBe(BOOK);
    expect(state.css).toBe(CSS);
});

test('aplicar é tudo-ou-nada: se gravar o HTML anterior (ou a sua etiqueta) falha, nada é tocado', async () => {
    for (const fail of ['saveHtml', 'labelHtml']) {
        const { tx, css, log, state } = setup({ fail: [fail] });
        await expect(tx.apply(both, 'x', css)).rejects.toThrow();
        expect(log.some((l) => l === 'commit:keep' || l === 'css.set')).toBe(false);
        expect(state.html).toBe(BOOK);
        expect(state.css).toBe(CSS);
    }
});

test('aplicar: se o registo falhar já está aplicado (só se perde o registo)', async () => {
    const { tx, css, state } = setup({ fail: ['record'] });
    const r = await tx.apply(htmlPlan, 'x', css);
    expect(r.status).toBe('applied');
    expect(state.html).toContain('p-non-indent');
});

test('aplicar: o servidor pode não devolver nome de ficheiro (sem etiqueta nem registo desse HTML)', async () => {
    const { tx, css, log } = setup({ saveHtmlReturns: undefined });
    const r = await tx.apply(htmlPlan, 'x', css);
    expect(r).toEqual({ status: 'applied', snapshots: {} });
    expect(log.some((l) => l.startsWith('labelHtml'))).toBe(false);
});

// ---- reverter ----

const change = { id: 'c1', request: 'o pedido', htmlFile: 'content_antes.html.gz', cssFile: 'style_antes.css' };

test('reverter: guarda o estado atual, lê tudo, e só então repõe o CSS e o HTML; marca no fim', async () => {
    const { tx, css, log, state } = setup({ html: ch('Um', '<p class="p-non-indent">a</p>'), css: `${CSS}    .nota { color: red; }\n` });
    await tx.revert(change, css);
    expect(log.map((l) => l.split(':')[0])).toEqual(['saveHtml', 'labelHtml', 'saveCss', 'readHtml', 'readCss', 'css.set', 'commit', 'markReverted']);
    expect(log[1]).toContain('Antes de reverter: o pedido');
    expect(log).toContain('commit:reset');
    expect(state.html).toBe(BOOK);
    expect(state.css).toBe(CSS);
});

test('reverter lê antes de tocar: se ler o que repor falha, o livro e o CSS ficam como estavam', async () => {
    for (const fail of ['readHtml', 'readCss']) {
        const current = { html: ch('Um', '<p>depois</p>'), css: 'depois{}' };
        const { tx, css, log, state } = setup({ ...current, fail: [fail] });
        await expect(tx.revert(change, css)).rejects.toThrow();
        expect(log.some((l) => l === 'css.set' || l.startsWith('commit'))).toBe(false);
        expect(state).toEqual(current);
    }
});

test('reverter: se guardar o estado atual falha, nada se repõe', async () => {
    const { tx, css, log } = setup({ fail: ['saveHtml'] });
    await expect(tx.revert(change, css)).rejects.toThrow('saveHtml falhou');
    expect(log).toEqual(['saveHtml']);
});

test('reverter só CSS (ou só HTML): não mexe no outro', async () => {
    const onlyCss = setup();
    await onlyCss.tx.revert({ id: 'c', request: 'x', cssFile: 'style_antes.css' }, onlyCss.css);
    expect(onlyCss.log.map((l) => l.split(':')[0])).toEqual(['saveCss', 'readCss', 'css.set', 'markReverted']);
    const onlyHtml = setup();
    await onlyHtml.tx.revert({ id: 'c', request: 'x', htmlFile: 'content_antes.html.gz' }, onlyHtml.css);
    expect(onlyHtml.log.map((l) => l.split(':')[0])).toEqual(['saveHtml', 'labelHtml', 'readHtml', 'commit', 'markReverted']);
});

test('reverter: não troca a etiqueta do ficheiro que vai repor (o servidor devolve o último se o conteúdo for igual)', async () => {
    const { tx, css, log } = setup({ saveHtmlReturns: 'content_antes.html.gz' });
    await tx.revert({ id: 'c', request: 'x', htmlFile: 'content_antes.html.gz' }, css);
    expect(log.some((l) => l.startsWith('labelHtml'))).toBe(false);
});

test('reverter: se só falhar marcar como revertida, já foi revertido e não rejeita', async () => {
    const { tx, css, state } = setup({ html: ch('Um', '<p>depois</p>'), fail: ['markReverted'] });
    await tx.revert(change, css);
    expect(state.html).toBe(BOOK);
});

test('aplicar e reverter são inversos: depois de reverter o livro e o CSS voltam ao que eram', async () => {
    const { tx, css, state } = setup();
    const r = await tx.apply(both, 'x', css);
    expect(state.html).not.toBe(BOOK);
    expect(r.status).toBe('applied');
    if (r.status !== 'applied') return;
    await tx.revert({ id: 'c', request: 'x', ...r.snapshots }, css);
    expect(state.html).toBe(BOOK);
    expect(state.css).toBe(CSS);
});
