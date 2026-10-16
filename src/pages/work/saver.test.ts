import { test, expect } from 'bun:test';
import { createSaver } from './saver';
import type { SaverDeps } from './saver';
import type { Draft } from '../../utils/local-draft';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setup(over: Partial<SaverDeps> = {}) {
    const s = { text: '<p>a</p>', readOnly: false, sendFails: false, draft: null as Draft | null, offline: false };
    const log: string[] = [];
    const deps: SaverDeps = {
        isbn: '1',
        getContent: () => s.text,
        send: async (c) => { if (s.sendFails) throw new Error('rede'); log.push(`send:${c}`); },
        sendOnUnload: (c) => log.push(`unload:${c}`),
        drafts: {
            save: async (_, h) => { s.draft = { html: h, ts: 1 }; log.push(`draft:${h}`); },
            load: async () => s.draft,
            clear: async (_, only) => { if (only === undefined || s.draft?.html === only) s.draft = null; },
        },
        readOnly: () => s.readOnly,
        onSaved: (c, n) => log.push(`saved:${c}:${n}`),
        onFailed: (n, e) => log.push(`failed:${n}:${e}`),
        autosaveMs: 20,
        draftDelayMs: 10,
        ...over,
    };
    return { s, log, saver: createSaver(deps) };
}

test('abrir sem editar não grava: baseline = o que o servidor tem', async () => {
    const { saver, log } = setup();
    saver.baseline();
    await saver.autosave();
    expect(saver.exit('app')).toBe(false);
    expect(log).toEqual([]);
});

test('autosave grava só o que mudou e atualiza a baseline', async () => {
    const { saver, s, log } = setup();
    saver.baseline();
    s.text = '<p>b</p>';
    await saver.autosave();
    await saver.autosave(); // já gravado
    expect(log).toEqual(['send:<p>b</p>', 'saved:<p>b</p>:false']);
});

test('modo leitura nunca grava, nem rascunho, nem na saída', async () => {
    const { saver, s, log } = setup();
    saver.baseline();
    s.text = '<p>b</p>'; s.readOnly = true;
    await saver.autosave();
    saver.contentChanged(); await wait(30);
    expect(saver.exit('unload')).toBe(false);
    expect(log).toEqual([]);
});

test('rascunho: escreve depois de assentar e save confirmado apaga-o', async () => {
    const { saver, s, log } = setup();
    saver.baseline();
    s.text = '<p>b</p>';
    saver.contentChanged(); saver.contentChanged();
    await wait(30);
    expect(log).toEqual(['draft:<p>b</p>']);
    await saver.save('<p>b</p>');
    expect(s.draft).toBeNull();
});

test('save falhado: onFailed, rascunho fica; online retoma só depois de falhar', async () => {
    const { saver, s, log } = setup();
    saver.baseline();
    s.text = '<p>b</p>';
    await saver.onOnline(); // nada falhou → não faz nada
    expect(log).toEqual([]);
    s.sendFails = true;
    saver.contentChanged(); await wait(30);
    await saver.autosave();
    expect(log).toEqual(['draft:<p>b</p>', 'failed:false:false']);
    s.sendFails = false;
    await saver.onOnline();
    expect(log.slice(2)).toEqual(['send:<p>b</p>', 'saved:<p>b</p>:false']);
    expect(s.draft).toBeNull();
});

test('saída: app = pedido normal com exit=true; unload = keepalive', async () => {
    const { saver, s, log } = setup();
    saver.baseline();
    s.text = '<p>b</p>';
    expect(saver.exit('unload')).toBe(true);
    expect(log).toEqual(['unload:<p>b</p>']);
    s.sendFails = true;
    saver.exit('app'); await wait(5);
    expect(log[1]).toBe('failed:false:true');
});

test('rascunho a oferecer: só se difere; bloqueia escrita até resolver', async () => {
    const { saver, s, log } = setup();
    saver.baseline();
    s.draft = { html: '<p>a</p>', ts: 1 }; // igual ao servidor
    expect(await saver.checkDraft()).toBeNull();
    expect(s.draft).toBeNull();

    const b = setup();
    b.saver.baseline();
    b.s.draft = { html: '<p>x</p>', ts: 1 };
    b.s.text = '<p>y</p>';
    expect((await b.saver.checkDraft())?.html).toBe('<p>x</p>');
    b.saver.contentChanged(); await wait(30);
    expect(b.log).toEqual([]); // não apagou o rascunho a recuperar
    b.saver.resolveDraft(false);
    expect(b.s.draft).toBeNull();
    expect(log).toEqual([]);
});

test('start/stop: o intervalo dispara o autosave', async () => {
    const { saver, s, log } = setup();
    saver.baseline();
    const stop = saver.start();
    s.text = '<p>b</p>';
    await wait(50);
    stop();
    expect(log).toContain('send:<p>b</p>');
});
