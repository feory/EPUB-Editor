/**
 * Canal de conteúdo (contentChannel.ts) pela interface — load/flush + os reports. Editor falso
 * (o TinyMCE real não arranca em happy-dom): conteúdo numa string, eventos e um undoManager
 * que regista as operações. O comportamento no editor real verifica-se no browser.
 */
import { test, expect } from 'bun:test';
import { attachContentChannel } from '../contentChannel';
import type { TinyMCEEditor } from '../types';

function fakeEditor(initial = '<p>a</p>') {
    let body = initial;
    const handlers: Record<string, Array<() => void>> = {};
    const log: string[] = [];
    let getContentCalls = 0;
    const fire = (name: string) => (handlers[name.toLowerCase()] ?? []).forEach((fn) => fn());
    const editor = {
        on: (names: string, fn: () => void) => names.split(' ').forEach((n) => (handlers[n.toLowerCase()] ??= []).push(fn)),
        getContent: () => { getContentCalls++; return body; },
        // o TinyMCE reserializa (aqui: aspas simples → duplas) e dispara SetContent
        setContent: (html: string) => { body = html.replace(/'/g, '"'); fire('SetContent'); },
        getBody: () => ({}),
        dom: { setHTML: (_b: unknown, html: string) => { body = html.replace(/'/g, '"'); } },
        undoManager: { clear: () => log.push('undo:clear'), add: () => { log.push('undo:add'); fire('change'); } },
        setDirty: (d: boolean) => log.push(`dirty:${d}`),
        dispatch: (name: string) => fire(name),
        nodeChanged: () => log.push('nodeChanged'),
    } as unknown as TinyMCEEditor;
    const type = (html: string) => { body = html; fire('input'); };
    return { editor, fire, log, type, getContentCalls: () => getContentCalls };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('report diferido: escrever não serializa a cada tecla — 1 report quando pára', async () => {
    const f = fakeEditor();
    const reports: string[] = [];
    attachContentChannel(f.editor, { onReport: (h) => reports.push(h), deferMs: 20 });
    f.type('<p>ab</p>'); f.type('<p>abc</p>'); f.type('<p>abcd</p>');
    expect(f.getContentCalls()).toBe(0);
    await wait(40);
    expect(reports).toEqual(['<p>abcd</p>']);
    expect(f.getContentCalls()).toBe(1);
});

test('flush reporta já o pendente (gravar/trocar de capítulo dentro do debounce)', () => {
    const f = fakeEditor();
    const reports: string[] = [];
    const ch = attachContentChannel(f.editor, { onReport: (h) => reports.push(h), deferMs: 1000 });
    f.type('<p>pendente</p>');
    ch.flush();
    expect(reports).toEqual(['<p>pendente</p>']);
    ch.flush(); // nada pendente → nada
    expect(reports.length).toBe(1);
});

test("load 'reset': limpa o undo e o estado de alterado; não é reportado como edição", () => {
    const f = fakeEditor();
    const reports: string[] = [];
    const ch = attachContentChannel(f.editor, { onReport: (h) => reports.push(h) });
    const out = ch.load("<p class='x'>capítulo</p>", { undo: 'reset' });
    expect(out).toBe('<p class="x">capítulo</p>'); // reserializado
    expect(f.log).toEqual(['undo:clear', 'undo:add', 'dirty:false']);
    expect(reports).toEqual([]);
});

test("load 'keep': passo de undo (reversível), sem limpar; não é reportado como edição", () => {
    const f = fakeEditor();
    const reports: string[] = [];
    const ch = attachContentChannel(f.editor, { onReport: (h) => reports.push(h) });
    ch.load('<p>externo</p>', { undo: 'keep' });
    expect(f.log).toEqual(['undo:add', 'nodeChanged']);
    expect(reports).toEqual([]);
});

test('sem eco: o conteúdo já conhecido (reportado ou carregado) não volta a ser carregado', async () => {
    const f = fakeEditor();
    const reports: string[] = [];
    const ch = attachContentChannel(f.editor, { onReport: (h) => reports.push(h), deferMs: 5 });
    ch.load("<p class='x'>c</p>", { undo: 'reset' });
    f.log.length = 0;
    ch.load("<p class='x'>c</p>", { undo: 'reset' }); // o mesmo html passado
    ch.load('<p class="x">c</p>', { undo: 'reset' }); // a versão reserializada
    expect(f.log).toEqual([]);
    f.type('<p>editado</p>');
    await wait(15);
    ch.load(reports[0], { undo: 'reset' }); // eco do report (estado → prop → load)
    expect(f.log).toEqual([]);
});

test('load descarta um report pendente do conteúdo que substituiu', async () => {
    const f = fakeEditor();
    const reports: string[] = [];
    const ch = attachContentChannel(f.editor, { onReport: (h) => reports.push(h), deferMs: 10 });
    f.type('<p>do capítulo antigo</p>');
    ch.load('<p>capítulo novo</p>', { undo: 'reset' });
    await wait(25);
    expect(reports).toEqual([]);
});

test('realce do diff ativo suspende os reports (como o isDiffHighlightingRef de hoje); a seguir voltam', () => {
    const f = fakeEditor();
    const reports: string[] = [];
    let diffOn = true;
    const ch = attachContentChannel(f.editor, { onReport: (h) => reports.push(h), shouldReport: () => !diffOn, deferMs: 1000 });
    f.fire('Undo'); // imediato, mas suspenso
    expect(reports).toEqual([]);
    diffOn = false;
    f.type('<p>depois</p>');
    ch.flush();
    expect(reports).toEqual(['<p>depois</p>']);
});

// --- normalize: limpeza depois de cada setContent ---------------------------------------------
// O fake guarda o conteúdo numa string; a "limpeza" acrescenta data-image-id às imagens sem ele.
function withNormalize() {
    const f = fakeEditor();
    const reports: string[] = [];
    let normalized = 0;
    const normalize = () => {
        const body = f.editor.getContent() as string;
        if (!body.includes('<img src="x">')) return false;
        normalized++;
        (f.editor as unknown as { dom: { setHTML: (b: unknown, h: string) => void } }).dom.setHTML({}, body.replace('<img src="x">', '<img src="x" data-image-id="1">'));
        return true;
    };
    const ch = attachContentChannel(f.editor, { onReport: (h) => reports.push(h), normalize, deferMs: 5 });
    return { f, ch, reports, normalizedCount: () => normalized };
}

test('carregamento que a limpeza muda → 1 report com o HTML limpo; o eco não recarrega', () => {
    const t = withNormalize();
    const out = t.ch.load('<p><img src="x"></p>', { undo: 'reset' });
    expect(out).toBe('<p><img src="x" data-image-id="1"></p>');
    expect(t.reports).toEqual(['<p><img src="x" data-image-id="1"></p>']);
    t.f.log.length = 0;
    t.ch.load(t.reports[0], { undo: 'reset' }); // eco: estado → prop → load
    expect(t.f.log).toEqual([]); // nada recarregado
});

test('carregamento que a limpeza não muda → sem report', () => {
    const t = withNormalize();
    t.ch.load('<p>texto</p>', { undo: 'reset' });
    expect(t.reports).toEqual([]);
});

test('colar/inserir (SetContent fora de um load) → limpo e reportado de imediato, sem recarregar', () => {
    const t = withNormalize();
    t.ch.load('<p>texto</p>', { undo: 'reset' });
    t.f.log.length = 0;
    t.f.editor.setContent('<p>texto</p><p><img src="x"></p>'); // simula o resultado de colar
    expect(t.reports).toEqual(['<p>texto</p><p><img src="x" data-image-id="1"></p>']);
    expect(t.f.log).toEqual([]);
});

test('nunca reporta um carregamento vazio, mesmo que a limpeza mude alguma coisa', () => {
    const f = fakeEditor('');
    const reports: string[] = [];
    const ch = attachContentChannel(f.editor, { onReport: (h) => reports.push(h), normalize: () => true });
    ch.load('   ', { undo: 'reset' });
    expect(reports).toEqual([]);
});
