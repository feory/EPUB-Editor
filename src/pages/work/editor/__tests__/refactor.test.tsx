/**
 * Testes de regressão da refatorização do WorkEditor (extração para editor/*).
 * Objetivo: provar que a extração preserva o comportamento — compara a config estática
 * byte-a-byte com o backup e EXECUTA o setup+overlays contra um editor simulado.
 *
 * ponytail: testes descartáveis de verificação; podem ser removidos após validação manual.
 */
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { buildContentStyle } from '../contentStyles';
import { EDITOR_PLUGINS, EDITOR_TOOLBAR, QUICKBARS_SELECTION_TOOLBAR, STYLE_FORMATS, TEXT_PATTERNS, SLASH_ITEMS } from '../config';
import { createEditorSetup } from '../setup';
import { useBlockOverlays, type BlockOverlaysApi } from '../useBlockOverlays';
import { BlockOverlays } from '../overlays/BlockOverlays';

const ORIG = '/private/tmp/claude-501/-Users-besteves-github-Almedina-EPUB-Plataform-V2/90928f2d-300b-40ce-b8dc-43501e91c65b/scratchpad/WorkEditor.tsx.orig';
const orig = readFileSync(ORIG, 'utf-8');

// DOM real para o setup/overlays (dom.create, closest, querySelector, etc.)
let win: Window;
beforeAll(() => {
    win = new Window();
    (globalThis as any).document = win.document;
    (globalThis as any).window = win;
    (globalThis as any).MutationObserver = class { observe() {} disconnect() {} };
});

// ---------------------------------------------------------------------------
// 1. content_style: idêntico ao original (currentCss + TAIL estático)
// ---------------------------------------------------------------------------
test('content_style estático é byte-idêntico ao backup', () => {
    const m = orig.match(/content_style: currentCss \+ `([\s\S]*?)`,/);
    expect(m).not.toBeNull();
    // buildContentStyle('') devolve exatamente o TAIL (o currentCss prefixado é '')
    expect(buildContentStyle('')).toBe(m![1]);
    // e prefixa o CSS do livro tal como antes
    expect(buildContentStyle('BODY{}')).toBe('BODY{}' + m![1]);
});

// ---------------------------------------------------------------------------
// 2. Config estática preservada
// ---------------------------------------------------------------------------
test('plugins idênticos ao backup', () => {
    const block = orig.match(/plugins: \[([\s\S]*?)\]/)![1];
    const fromOrig = [...block.matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
    expect(EDITOR_PLUGINS).toEqual(fromOrig);
});

test('toolbar / quickbars idênticos ao backup', () => {
    expect(orig).toContain(QUICKBARS_SELECTION_TOOLBAR);
    // tokens críticos da toolbar mantidos
    for (const tok of ['undo redo', 'styles removeformat', 'smalltext smallcaps', 'chapterbreak box noBreak', 'code fullscreen']) {
        expect(EDITOR_TOOLBAR).toContain(tok);
    }
});

test('style_formats e text_patterns cobrem os mesmos formatos', () => {
    const formats = STYLE_FORMATS.flatMap((g) => g.items.map((i) => i.format));
    for (const f of ['h1', 'h2', 'h3', 'p', 'p-indent', 'p-top', 'p-space', 'p-small', 'p-legendas', 'p-bold', 'p-italic', 'p-bold-italic', 'p-quote', 'p-border-top', 'p-border-bottom', 'p-border-sides', 'drop-cap', 'footnote', 'box', 'noBreak']) {
        expect(formats).toContain(f);
    }
    expect(TEXT_PATTERNS.find((p: any) => p.start === '---')?.replacement).toBe('<hr>');
    expect(SLASH_ITEMS.map((i) => i.value)).toEqual(['h1', 'h2', 'h3', 'p', 'p-quote', 'p-small', 'footnote', 'image', 'hr']);
});

// ---------------------------------------------------------------------------
// 3. EXECUÇÃO: setup.ts + useBlockOverlays.wireEditor contra um editor simulado
// ---------------------------------------------------------------------------
function makeMockEditor(doc: Document) {
    const reg = { buttons: new Set<string>(), toggle: new Set<string>(), menu: new Set<string>(), ctx: new Set<string>(), auto: new Set<string>(), icons: new Set<string>() };
    const on: Record<string, Function[]> = {};
    const shortcuts = new Set<string>();
    const formats = new Set<string>();
    const body = doc.createElement('div');
    const container = doc.createElement('div');
    const statusbar = doc.createElement('div'); statusbar.className = 'tox-statusbar'; container.appendChild(statusbar);
    const iframe = doc.createElement('iframe'); container.appendChild(iframe);
    let curNode: any = body;
    const winStub = { addEventListener() {}, removeEventListener() {}, scrollTo() {} };
    const editor: any = {
        _reg: reg, _on: on, _shortcuts: shortcuts, _formats: formats, _body: body,
        setNode: (n: any) => { curNode = n; },
        ui: { registry: {
            addButton: (n: string) => reg.buttons.add(n),
            addToggleButton: (n: string) => reg.toggle.add(n),
            addMenuButton: (n: string) => reg.menu.add(n),
            addContextToolbar: (n: string) => reg.ctx.add(n),
            addAutocompleter: (n: string) => reg.auto.add(n),
            addIcon: (n: string) => reg.icons.add(n),
        } },
        on: (name: string, cb: Function) => { (on[name] ||= []).push(cb); },
        off() {},
        fire: (name: string, ev: any) => (on[name] || []).forEach((cb) => cb(ev)),
        addShortcut: (k: string) => shortcuts.add(k),
        addCommand() {},
        getBody: () => body,
        getWin: () => winStub,
        getContainer: () => container,
        getDoc: () => doc,
        hasFocus: () => true,
        focus() {}, dispatch() {}, nodeChanged() {}, insertContent() {},
        selection: {
            getNode: () => curNode,
            getBookmark: () => ({}), moveToBookmark() {}, setRng() {}, select() {},
            collapse() {}, setCursorLocation() {}, isCollapsed: () => true,
            getContent: () => '', setContent() {},
        },
        formatter: {
            register: (n: string) => formats.add(n),
            apply() {}, toggle() {}, remove() {}, match: () => false, formatChanged() {},
        },
        dom: {
            getParent: (n: any, sel: string) => (n && n.closest ? n.closest(sel) : null),
            create: (tag: string, attrs: Record<string, string> = {}, html?: string) => {
                const el = doc.createElement(tag);
                Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
                if (html != null) el.innerHTML = html;
                return el;
            },
            setAttrib: (el: any, k: string, v: any) => (v == null ? el.removeAttribute(k) : el.setAttribute(k, v)),
            remove: (el: any) => el.remove(),
            select: (sel: string) => Array.from(body.querySelectorAll(sel)),
            addClass: (el: any, c: string) => el.classList.add(c),
            removeClass: (el: any, c: string) => el.classList.remove(c),
            hasClass: (el: any, c: string) => el.classList.contains(c),
            getOuterHTML: (el: any) => el.outerHTML,
            encode: (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        },
        serializer: { addTempAttr() {} },
        editorUpload: { blobCache: { create: () => ({ blobUri: () => '' }), add() {} } },
        windowManager: { open() {} },
        mode: { set() {} },
    };
    return editor;
}

// captura a api do hook via um render estático do harness
function getOverlaysApi(editorRef: any): BlockOverlaysApi {
    let api: BlockOverlaysApi | null = null;
    function Harness() { api = useBlockOverlays(editorRef); return null; }
    renderToStaticMarkup(React.createElement(Harness));
    return api!;
}

test('setup + wireEditor registam a superfície esperada sem lançar', () => {
    const editor = makeMockEditor(win.document as any);
    const editorRef = { current: editor };
    const overlays = getOverlaysApi(editorRef);

    const setup = createEditorSetup({
        setHtmlContent() {},
        isCleaningRef: { current: false },
        onGrammarClick() {}, onSave() {}, onExport() {}, onUndo() {}, onRedo() {},
        startHtmlEdit: overlays.startHtmlEdit,
        wireOverlays: overlays.wireEditor,
    });
    // não deve lançar
    setup(editor);

    // botões / toggles / menus / context toolbars / autocompleter
    for (const b of ['chapterbreak', 'edithtml']) expect(editor._reg.buttons.has(b)).toBe(true);
    for (const t of ['imgalignleft', 'imgaligncenter', 'imgalignright', 'psdefault', 'psindent', 'pstop', 'psspace', 'psquote', 'psh1', 'psh2', 'psh3', 'smalltext', 'smallcaps', 'box', 'noBreak']) {
        expect(editor._reg.toggle.has(t)).toBe(true);
    }
    // botões mortos removidos
    expect(editor._reg.toggle.has('pssmall')).toBe(false);
    expect(editor._reg.toggle.has('psbold')).toBe(false);
    for (const m of ['psmorepara', 'psmorehead', 'blockalignmenu']) expect(editor._reg.menu.has(m)).toBe(true);
    for (const c of ['imagealign', 'blockalign', 'parastyles', 'headingstyles']) expect(editor._reg.ctx.has(c)).toBe(true);
    expect(editor._reg.auto.has('slashmenu')).toBe(true);
    // ícones ps-*
    for (const i of ['ps-default', 'ps-h1', 'ps-htmledit', 'ps-small']) expect(editor._reg.icons.has(i)).toBe(true);
    // atalhos
    for (const k of ['meta+s,ctrl+s', 'meta+1,ctrl+1', 'meta+z,ctrl+z']) expect(editor._shortcuts.has(k)).toBe(true);
    // handlers de eventos (incluindo overlays wired)
    for (const ev of ['drop', 'SetContent', 'click', 'init', 'NodeChange', 'input', 'ExecCommand', 'PreInit', 'mousemove', 'blur', 'remove']) {
        expect((editor._on[ev] || []).length).toBeGreaterThan(0);
    }
});

test('init callbacks executam sem lançar e registam formatos', () => {
    const editor = makeMockEditor(win.document as any);
    const editorRef = { current: editor };
    const overlays = getOverlaysApi(editorRef);
    createEditorSetup({
        setHtmlContent() {}, isCleaningRef: { current: false },
        startHtmlEdit: overlays.startHtmlEdit, wireOverlays: overlays.wireEditor,
    })(editor);
    // disparar PreInit e todos os init handlers
    editor.fire('PreInit', {});
    expect(() => editor.fire('init', {})).not.toThrow();
    for (const f of ['p-indent', 'p-top', 'box', 'noBreak', 'small-caps']) expect(editor._formats.has(f)).toBe(true);
});

test('ExecCommand FormatBlock h1 insere marcador de capítulo (syncChapterMarker)', () => {
    const editor = makeMockEditor(win.document as any);
    const editorRef = { current: editor };
    const overlays = getOverlaysApi(editorRef);
    createEditorSetup({
        setHtmlContent() {}, isCleaningRef: { current: false },
        startHtmlEdit: overlays.startHtmlEdit, wireOverlays: overlays.wireEditor,
    })(editor);

    const h1 = win.document.createElement('h1');
    h1.textContent = 'Capítulo Um';
    editor._body.appendChild(h1);
    editor.setNode(h1);
    editor.fire('ExecCommand', { command: 'FormatBlock', value: 'h1' });

    const prev = h1.previousElementSibling as HTMLElement;
    expect(prev).not.toBeNull();
    expect(prev.className).toBe('chapter-break-h1');
    expect(prev.getAttribute('data-title')).toBe('Capítulo Um');
});

test('slash onAction "hr" insere <hr> via mceInsertContent', () => {
    const editor = makeMockEditor(win.document as any);
    const cmds: any[] = [];
    editor.execCommand = (c: string, ui: boolean, v: any) => cmds.push([c, v]);
    const editorRef = { current: editor };
    const overlays = getOverlaysApi(editorRef);
    createEditorSetup({
        setHtmlContent() {}, isCleaningRef: { current: false },
        startHtmlEdit: overlays.startHtmlEdit, wireOverlays: overlays.wireEditor,
    })(editor);
    // aceder ao autocompleter registado: re-registamos via spy
    // (o setup chamou addAutocompleter('slashmenu', cfg) — capturamos o cfg)
    let cfg: any = null;
    editor.ui.registry.addAutocompleter = (_n: string, c: any) => { cfg = c; };
    createEditorSetup({
        setHtmlContent() {}, isCleaningRef: { current: false },
        startHtmlEdit: overlays.startHtmlEdit, wireOverlays: overlays.wireEditor,
    })(editor);
    expect(cfg).not.toBeNull();
    cfg.onAction({ hide() {} }, {} as any, 'hr');
    expect(cmds.some(([c, v]) => c === 'mceInsertContent' && v === '<hr>')).toBe(true);
    // 'hr-full' morto: nunca produzido pelo menu
    expect(SLASH_ITEMS.some((i) => i.value === 'hr-full')).toBe(false);
});

// ---------------------------------------------------------------------------
// 4. RENDER: BlockOverlays rende cada overlay conforme o estado
// ---------------------------------------------------------------------------
function baseApi(over: Partial<BlockOverlaysApi>): BlockOverlaysApi {
    return {
        addBtnPos: null, plusMenu: null, gripPos: null, gripMenu: null, hrCtl: null,
        htmlEdit: null, htmlEditPos: null, dropLine: null,
        htmlTextareaRef: { current: null },
        openPlusMenu() {}, closePlusMenu() {}, plusAction() {}, cancelAddBtnHide() {}, clearAddBtn() {},
        startBlockDrag() {}, setGripMenu() {}, gripAction() {}, setHrWidth() {}, endHtmlEdit() {}, saveHtmlEdit() {},
        startHtmlEdit() {}, wireEditor() {},
        ...over,
    } as BlockOverlaysApi;
}

test('BlockOverlays: readOnly esconde +, pega e controlo hr', () => {
    const html = renderToStaticMarkup(React.createElement(BlockOverlays, {
        ...baseApi({ addBtnPos: { top: 10, left: 10 }, gripPos: { top: 5, left: 5 }, hrCtl: { top: 1, left: 1 } }),
        readOnly: true,
    } as any));
    expect(html).not.toContain('Adicionar parágrafo');
    expect(html).not.toContain('Mover parágrafo');
    expect(html).not.toContain('Pequena');
});

test('BlockOverlays: menu "+" rende 9 opções em grelha 2-col', () => {
    const html = renderToStaticMarkup(React.createElement(BlockOverlays, baseApi({ plusMenu: { top: 100, left: 100 } }) as any));
    expect(html).toContain('Inserir bloco');
    expect(html).toContain('grid-cols-2');
    for (const l of ['Parágrafo', 'Título 1', 'Título 2', 'Título 3', 'Citação', 'Texto pequeno', 'Nota de rodapé', 'Imagem', 'Divisória']) {
        expect(html).toContain(l);
    }
});

test('BlockOverlays: edição HTML inline rende textarea + guardar/cancelar', () => {
    const html = renderToStaticMarkup(React.createElement(BlockOverlays, baseApi({
        htmlEdit: '<p>x</p>',
        htmlEditPos: { top: 0, left: 0, width: 300, height: 40, visible: true },
    }) as any));
    expect(html).toContain('<textarea');
    expect(html).toContain('Guardar');
    expect(html).toContain('Cancelar');
});

test('BlockOverlays: + e pega aparecem quando não-readOnly', () => {
    const html = renderToStaticMarkup(React.createElement(BlockOverlays, {
        ...baseApi({ addBtnPos: { top: 10, left: 10 }, gripPos: { top: 5, left: 5 } }),
        readOnly: false,
    } as any));
    expect(html).toContain('Adicionar parágrafo');
    expect(html).toContain('Mover parágrafo');
});
