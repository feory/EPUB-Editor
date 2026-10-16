/**
 * Report incremental do canal de conteúdo: só os blocos de topo que mudaram são re-serializados;
 * estrutura alterada ou dúvida sobre o alinhamento caem no getContent() completo. Corpo real
 * (happy-dom) e editor falso cujo getContent() separa os blocos com '\n', como o TinyMCE.
 */
import { test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import { attachContentChannel } from '../contentChannel';
import type { TinyMCEEditor } from '../types';

let win: Window;
beforeEach(() => {
    win = new Window();
    (globalThis as Record<string, unknown>).MutationObserver = win.MutationObserver;
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setup(serialize?: (el: Element) => string) {
    const body = win.document.createElement('body') as unknown as HTMLElement;
    const handlers: Record<string, Array<() => void>> = {};
    const calls = { getContent: 0, serialize: 0 };
    const full = () => Array.from(body.children).map((c) => c.outerHTML).join('\n');
    const editor = {
        on: (names: string, fn: () => void) => names.split(' ').forEach((n) => (handlers[n.toLowerCase()] ??= []).push(fn)),
        getContent: () => { calls.getContent++; return full(); },
        // body já preenchido pelo teste (ex. <pre> com '\n' dentro): o load não o reescreve
        setContent: (html: string) => { if (!body.children.length) body.innerHTML = html.split('\n').join(''); },
        getBody: () => body,
        serializer: { serialize: (el: Element) => { calls.serialize++; return serialize ? serialize(el) : el.outerHTML; } },
        dom: { setHTML: (b: HTMLElement, html: string) => { b.innerHTML = html.split('\n').join(''); } },
        undoManager: { clear() {}, add() {} },
        setDirty() {}, dispatch() {}, nodeChanged() {},
    } as unknown as TinyMCEEditor;
    const fire = (n: string) => (handlers[n.toLowerCase()] ?? []).forEach((fn) => fn());
    return { body, editor, calls, fire, full };
}

function attach(f: ReturnType<typeof setup>, verify = false) {
    const reports: string[] = [];
    const ch = attachContentChannel(f.editor, { onReport: (h) => reports.push(h), deferMs: 10, verify });
    ch.load('<p>a</p>\n<p>b</p>\n<p>c</p>', { undo: 'reset' });
    return { reports, ch };
}

test('escrever num bloco: re-serializa só esse, sem getContent, e o resultado é igual ao completo', async () => {
    const f = setup();
    const { reports } = attach(f);
    const loadCalls = f.calls.getContent;
    f.body.children[1].textContent = 'bb';
    f.fire('input');
    await wait(30);
    expect(reports).toEqual(['<p>a</p>\n<p>bb</p>\n<p>c</p>']);
    expect(f.calls.getContent).toBe(loadCalls);
    expect(f.calls.serialize).toBe(1);
    expect(reports[0]).toBe(f.full());
});

test('dois reports seguidos acumulam: o 2.º só toca no bloco novo', async () => {
    const f = setup();
    const { reports } = attach(f);
    f.body.children[0].textContent = 'x'; f.fire('input'); await wait(30);
    f.body.children[2].textContent = 'z'; f.fire('input'); await wait(30);
    expect(reports[1]).toBe('<p>x</p>\n<p>b</p>\n<p>z</p>');
    expect(f.calls.serialize).toBe(2);
});

test('estrutura alterada (bloco acrescentado/removido) usa o getContent completo e volta ao incremental depois', async () => {
    const f = setup();
    const { reports } = attach(f);
    const base = f.calls.getContent;
    const p = win.document.createElement('p'); p.textContent = 'd';
    f.body.appendChild(p as unknown as Node);
    f.fire('input'); await wait(30);
    expect(f.calls.getContent).toBe(base + 1);
    expect(reports[0]).toBe('<p>a</p>\n<p>b</p>\n<p>c</p>\n<p>d</p>');
    f.body.children[0].textContent = 'A'; f.fire('input'); await wait(30);
    expect(f.calls.getContent).toBe(base + 1); // incremental outra vez
    expect(reports[1]).toBe(f.full());
    f.body.removeChild(f.body.children[3] as unknown as Node);
    f.fire('input'); await wait(30);
    expect(f.calls.getContent).toBe(base + 2);
    expect(reports[2]).toBe(f.full());
});

test('bloco com quebra de linha no texto: o alinhamento falha e usa sempre o completo (resultado certo)', async () => {
    const f = setup();
    f.body.innerHTML = '<pre>l1\nl2</pre><p>b</p>';
    const reports: string[] = [];
    const ch = attachContentChannel(f.editor, { onReport: (h) => reports.push(h), deferMs: 10 });
    ch.load('<pre>l1\nl2</pre>\n<p>b</p>', { undo: 'reset' });
    const base = f.calls.getContent;
    f.body.children[1].textContent = 'bb'; f.fire('input'); await wait(30);
    expect(f.calls.getContent).toBe(base + 1);
    expect(reports[0]).toBe(f.full());
});

test('verify: se o incremental divergir do completo, regista e usa o completo', async () => {
    const f = setup((el) => el.outerHTML + 'X'); // serializador "errado"
    const { reports } = attach(f, true);
    const orig = console.error; const errs: string[] = [];
    console.error = (m: string) => errs.push(m);
    f.body.children[1].textContent = 'bb'; f.fire('input'); await wait(30);
    console.error = orig;
    expect(errs.length).toBe(1);
    expect(reports[0]).toBe(f.full());
});

test('mudar atributo do próprio body não conta como estrutura', async () => {
    const f = setup();
    const { reports } = attach(f);
    const base = f.calls.getContent;
    (f.body as HTMLElement).classList.add('ps-grip-menu');
    f.body.children[0].textContent = 'x'; f.fire('input'); await wait(30);
    expect(f.calls.getContent).toBe(base);
    expect(reports[0]).toBe(f.full());
});
