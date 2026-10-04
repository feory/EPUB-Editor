/**
 * Mini-menu (miniMenu.ts) testado pela interface: attachMiniMenu + suppress. O happy-dom não
 * calcula layout, por isso as dimensões são definidas por elemento (getBoundingClientRect,
 * offsetHeight/Width/Parent) a partir de um estado mutável. Os cenários reproduzem os bugs
 * encontrados no browser (coords do aux, pop esmagado, ciclo do observer, dropdowns, editor
 * deslocado, menu fora do ecrã).
 */
import { test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import { attachMiniMenu } from '../miniMenu';
import type { TinyMCEEditor } from '../types';

type Rect = { top: number; left: number; width: number; height: number };
const rectOf = (r: Rect) => ({
    top: r.top, left: r.left, right: r.left + r.width, bottom: r.top + r.height,
    width: r.width, height: r.height, x: r.left, y: r.top, toJSON() { return this; },
}) as DOMRect;

const POP_W = 452;
const POP_H = 48;

let win: Window;
let resizeCallbacks: Array<() => void>;

beforeEach(() => {
    win = new Window({ innerWidth: 1470, innerHeight: 900 });
    const g = globalThis as Record<string, unknown>;
    g.window = win;
    g.document = win.document;
    g.MutationObserver = win.MutationObserver;
    resizeCallbacks = [];
    g.ResizeObserver = class { constructor(cb: () => void) { resizeCallbacks.push(cb); } observe() {} disconnect() {} };
});

function setup() {
    const d = win.document as unknown as Document;
    // Estado de layout (coords da janela); os testes mudam-no e disparam scroll/resize.
    const s = {
        aux: { top: 654, left: 0, width: 1470, height: 0 },
        iframe: { top: 200, left: 400, width: 900, height: 400 },
        block: { top: 100, left: 20, width: 860, height: 40 }, // relativo ao iframe
        collapsed: true,
    };

    const aux = d.createElement('div'); aux.className = 'tox tox-tinymce-aux';
    const pop = d.createElement('div'); pop.className = 'tox-pop';
    aux.appendChild(pop); d.body.appendChild(aux);
    aux.getBoundingClientRect = () => rectOf(s.aux);
    const px = (v: string) => (v ? parseFloat(v) : 0);
    // Absoluto no aux: encolhe ao espaço até à direita do contentor; com top E bottom fica esmagado.
    const popW = () => Math.min(POP_W, s.aux.width - px(pop.style.left));
    const popH = () => (pop.style.top && pop.style.bottom ? 20 : POP_H);
    Object.defineProperty(pop, 'offsetParent', { get: () => aux });
    Object.defineProperty(pop, 'offsetWidth', { get: popW });
    Object.defineProperty(pop, 'offsetHeight', { get: popH });
    pop.getBoundingClientRect = () => rectOf({ top: s.aux.top + px(pop.style.top), left: s.aux.left + px(pop.style.left), width: popW(), height: popH() });

    const container = d.createElement('div');
    const header = d.createElement('div'); header.className = 'tox-editor-header';
    const iframe = d.createElement('iframe');
    container.append(header, iframe); d.body.appendChild(container);
    iframe.getBoundingClientRect = () => rectOf(s.iframe);

    const block = d.createElement('p'); d.body.appendChild(block);
    block.getBoundingClientRect = () => rectOf(s.block);

    const handlers: Record<string, Array<() => void>> = {};
    const calls = { nodeChanged: 0, focus: [] as unknown[] };
    const editor = {
        on: (names: string, fn: () => void) => names.split(' ').forEach((n) => (handlers[n] ??= []).push(fn)),
        selection: { isCollapsed: () => s.collapsed, getNode: () => block },
        dom: { getParent: () => null },
        getContainer: () => container,
        getWin: () => win,
        getBody: () => ({ focus: (o: unknown) => calls.focus.push(o) }),
        nodeChanged: () => { calls.nodeChanged++; },
    } as unknown as TinyMCEEditor;

    const menu = attachMiniMenu(editor, { blockOf: () => block });
    handlers.init.forEach((fn) => fn());

    // Coords da janela onde o pop está, e o alvo (linha da borda do bloco).
    const view = {
        popTop: () => pop.getBoundingClientRect().top,
        popBottom: () => pop.getBoundingClientRect().bottom,
        popLeft: () => pop.getBoundingClientRect().left,
        blockTop: () => s.iframe.top + s.block.top,
        blockBottom: () => s.iframe.top + s.block.top + s.block.height,
        blockLeft: () => s.iframe.left + s.block.left,
    };
    const scroll = () => win.dispatchEvent(new win.Event('scroll'));
    const flush = () => new Promise((r) => setTimeout(r, 10)); // entrega do MutationObserver
    return { s, d, aux, pop, header, menu, calls, view, scroll, flush };
}

test('1. em cima, encostado à linha da borda e alinhado à esquerda; segue o editor quando este se desloca', () => {
    const t = setup();
    t.scroll();
    expect(t.pop.style.visibility).toBe('');
    expect(t.view.popBottom()).toBe(t.view.blockTop() - 4);
    expect(t.view.popLeft()).toBe(t.view.blockLeft() - 4);
    // editor desloca-se sem scroll nem resize da janela (barra lateral) → ResizeObserver
    t.s.iframe.left = 600;
    resizeCallbacks.forEach((cb) => cb());
    expect(t.view.popLeft()).toBe(t.view.blockLeft() - 4);
});

test('2. sem espaço em cima → em baixo, encostado; sem espaço nenhum → escondido', () => {
    const t = setup();
    t.s.block.top = 2;
    t.scroll();
    expect(t.view.popTop()).toBe(t.view.blockBottom() + 4);
    t.s.iframe.height = 60; t.s.block.height = 50;
    t.scroll();
    expect(t.pop.style.visibility).toBe('hidden');
});

test('3. style.top/left convertidos para coords do contentor do TinyMCE (aux no fim da página)', () => {
    const t = setup();
    t.scroll();
    const target = t.view.blockTop() - 4 - 48;
    expect(parseFloat(t.pop.style.top)).toBe(target - t.s.aux.top); // 248 − 654
    expect(t.view.popTop()).toBe(target);
});

test('4. limpa bottom/right do TinyMCE antes de medir (senão o pop ficava esmagado)', () => {
    const t = setup();
    t.pop.style.top = '10px'; t.pop.style.bottom = '30px'; t.pop.style.right = '5px';
    t.scroll();
    expect(t.pop.style.bottom).toBe('');
    expect(t.pop.style.right).toBe('');
    expect(t.pop.offsetHeight).toBe(48);
    expect(t.view.popBottom()).toBe(t.view.blockTop() - 4);
});

test('5. sem ciclo: as próprias escritas não redisparam a colocação', async () => {
    const t = setup();
    t.scroll();
    let batches = 0;
    new win.MutationObserver(() => { batches++; }).observe(t.aux as never, { subtree: true, attributes: true, attributeFilter: ['style'] });
    t.pop.style.top = '999px'; // o TinyMCE recoloca-o à maneira dele
    await t.flush();
    expect(t.view.popBottom()).toBe(t.view.blockTop() - 4); // corrigido
    const settled = batches;
    await t.flush(); await t.flush();
    expect(batches).toBe(settled); // e parou
    expect(settled).toBeLessThan(4);
});

test('6. dropdowns DESTE menu acompanham a deslocação; os da barra principal não', () => {
    const t = setup();
    const btn = t.d.createElement('button'); btn.className = 'tox-tbtn'; t.pop.appendChild(btn);
    const dropdown = t.d.createElement('div'); dropdown.className = 'tox-menu'; dropdown.style.top = '100px'; dropdown.style.left = '300px';
    t.aux.appendChild(dropdown);
    t.scroll();
    // sem botão expandido no mini-menu (o dropdown é da barra principal) → não mexe
    t.s.block.top = 80; t.scroll();
    expect(dropdown.style.top).toBe('100px');
    // dropdown aberto a partir do mini-menu → acompanha
    btn.setAttribute('aria-expanded', 'true');
    t.s.block.top = 60; t.scroll();
    expect(dropdown.style.top).toBe('80px');
    expect(dropdown.style.left).toBe('300px');
});

test('7. clamp à direita pelo contentor, medido com a largura natural', () => {
    const t = setup();
    t.s.aux.width = 1000;
    t.s.iframe.left = 700; // bloco a 720 → 720−4+452 sairia do contentor
    t.scroll();
    expect(t.pop.offsetWidth).toBe(452); // não encolheu
    expect(t.view.popLeft()).toBe(1000 - 452 - 4);
});

test('8. supressão: cada motivo esconde; só reaparece sem motivos (inclui hover da barra principal)', () => {
    const t = setup();
    t.scroll();
    t.menu.suppress('grip', true);
    expect(t.pop.style.visibility).toBe('hidden');
    t.menu.suppress('plusMenu', true);
    t.menu.suppress('grip', false);
    expect(t.pop.style.visibility).toBe('hidden');
    t.scroll(); // recolocar não o mostra enquanto houver motivo
    expect(t.pop.style.visibility).toBe('hidden');
    const before = t.calls.nodeChanged;
    t.menu.suppress('plusMenu', false);
    expect(t.pop.style.visibility).toBe('');
    expect(t.calls.nodeChanged).toBe(before + 1);
    t.menu.suppress('plusMenu', false); // sem mudança → nada
    expect(t.calls.nodeChanged).toBe(before + 1);
    t.header.dispatchEvent(new win.Event('mouseenter') as never);
    expect(t.pop.style.visibility).toBe('hidden');
    t.header.dispatchEvent(new win.Event('mouseleave') as never);
    expect(t.pop.style.visibility).toBe('');
});

test('9. seleção de texto: não mexe na barra de seleção (só toolbar/pega a escondem)', () => {
    const t = setup();
    t.s.collapsed = false;
    t.pop.style.top = '999px';
    t.scroll();
    expect(t.pop.style.top).toBe('999px');
    t.menu.suppress('plusMenu', true);
    expect(t.pop.style.visibility).toBe('');
    t.menu.suppress('grip', true);
    expect(t.pop.style.visibility).toBe('hidden');
});

test('10. escondido por não caber com um dropdown aberto: fecha-o e devolve o foco sem scroll', () => {
    const t = setup();
    let clicks = 0;
    const btn = t.d.createElement('button'); btn.className = 'tox-tbtn'; btn.setAttribute('aria-expanded', 'true');
    btn.addEventListener('click', () => { clicks++; btn.setAttribute('aria-expanded', 'false'); }); // toggle, como no TinyMCE
    t.pop.appendChild(btn);
    t.s.block.top = 900; // fora de vista
    t.scroll();
    expect(t.pop.style.visibility).toBe('hidden');
    expect(clicks).toBe(1);
    expect(t.calls.focus).toEqual([{ preventScroll: true }]);
});
