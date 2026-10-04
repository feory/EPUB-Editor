/**
 * Bloco ativo (activeBlock.ts) pela interface: attachActiveBlock → current/isCollapsed, mais
 * as marcas no DOM que o CSS lê. Editor falso: foco, seleção e eventos (click, NodeChange)
 * controlados pelo teste — o TinyMCE real não arranca em happy-dom.
 */
import { test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import { attachActiveBlock } from '../activeBlock';
import type { TinyMCEEditor } from '../types';

let win: Window;
beforeEach(() => { win = new Window(); });

function setup(before?: (editor: TinyMCEEditor) => void) {
    const d = win.document as unknown as Document;
    const body = d.createElement('div');
    body.innerHTML = '<p id="a">um</p><h2 id="b">dois</h2><p id="c">três</p>';
    d.body.appendChild(body);
    const $ = (id: string) => body.querySelector('#' + id) as HTMLElement;
    const s = { focus: true, node: $('a') as Node };

    type H = { fn: (e?: unknown) => void; prepend: boolean };
    const handlers: Record<string, H[]> = {};
    const fire = (name: string, e?: unknown) => (handlers[name] ?? []).forEach((h) => h.fn(e));
    const editor = {
        on: (name: string, fn: (e?: unknown) => void, prepend = false) => {
            const list = (handlers[name] ??= []);
            if (prepend) list.unshift({ fn, prepend }); else list.push({ fn, prepend });
        },
        hasFocus: () => s.focus,
        selection: { getNode: () => s.node },
        getBody: () => body,
        nodeChanged: () => fire('NodeChange'),
        serializer: { addTempAttr: () => {} },
        dom: {
            select: (sel: string) => Array.from(body.querySelectorAll(sel)),
            setAttrib: (el: HTMLElement, name: string, v: string | null) => (v === null ? el.removeAttribute(name) : el.setAttribute(name, v)),
        },
    } as unknown as TinyMCEEditor;
    const blockOf = (n: Node | null) => (n ? (n as Element).closest?.('p,h1,h2,h3,h4,h5,h6') ?? null : null);

    before?.(editor);
    const active = attachActiveBlock(editor, { blockOf });
    const moveTo = (id: string) => { s.node = $(id); fire('NodeChange'); };
    const click = (id: string) => { s.node = $(id); fire('NodeChange'); fire('click', { target: $(id) }); };
    const marked = () => Array.from(body.querySelectorAll('[data-mce-psactive]')).map((e) => e.id);
    return { s, $, body, active, editor, moveTo, click, marked, fire };
}

test('bloco ativo = bloco do cursor com foco; marcas no DOM e classe no body', () => {
    const t = setup();
    t.moveTo('b');
    expect(t.active.current()).toBe(t.$('b'));
    expect(t.marked()).toEqual(['b']);
    expect(t.body.classList.contains('ps-has-active')).toBe(true);
});

test('sem foco → nenhum bloco ativo (colocação programática do cursor não conta)', () => {
    const t = setup();
    t.moveTo('a');
    t.s.focus = false;
    t.moveTo('c');
    expect(t.active.current()).toBeNull();
    expect(t.marked()).toEqual([]);
    expect(t.body.classList.contains('ps-has-active')).toBe(false);
});

test('2.º clique no mesmo bloco recolhe; 3.º volta a mostrar', () => {
    const t = setup();
    t.click('a');
    expect(t.active.current()).toBe(t.$('a'));
    t.click('a');
    expect(t.active.isCollapsed(t.$('a'))).toBe(true);
    expect(t.active.current()).toBeNull();
    expect(t.marked()).toEqual([]);
    t.click('a');
    expect(t.active.isCollapsed(t.$('a'))).toBe(false);
    expect(t.active.current()).toBe(t.$('a'));
});

test('clique noutro bloco desfaz o recolhido', () => {
    const t = setup();
    t.click('a'); t.click('a');
    expect(t.active.isCollapsed(t.$('a'))).toBe(true);
    t.click('c');
    expect(t.active.isCollapsed(t.$('a'))).toBe(false);
    expect(t.active.current()).toBe(t.$('c'));
});

test('limpa TODAS as marcas (Enter clona o atributo para os <p> novos)', () => {
    const t = setup();
    t.moveTo('a');
    t.$('c').setAttribute('data-mce-psactive', '1'); // clone do Enter
    t.moveTo('b');
    expect(t.marked()).toEqual(['b']);
});

test('quem ouve o NodeChange já vê a resposta nova — mesmo registado ANTES do módulo', () => {
    let seen: HTMLElement | null | undefined;
    let getActive: () => HTMLElement | null = () => null;
    const t = setup((editor) => editor.on('NodeChange', () => { seen = getActive(); }));
    getActive = t.active.current;
    t.moveTo('c');
    expect(seen).toBe(t.$('c'));
});
