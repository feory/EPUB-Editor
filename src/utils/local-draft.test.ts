import { test, expect } from 'bun:test';
import { createDrafts, isRecoverable } from './local-draft';
import type { Draft, DraftKv } from './local-draft';

function memKv(): DraftKv {
    const m = new Map<string, Draft>();
    return {
        get: async (k) => m.get(k),
        set: async (k, v) => { m.set(k, v); },
        del: async (k) => { m.delete(k); },
    };
}

test('save/load/clear', async () => {
    const d = createDrafts(memKv());
    expect(await d.load('1')).toBeNull();
    await d.save('1', '<p>a</p>');
    expect((await d.load('1'))?.html).toBe('<p>a</p>');
    await d.clear('1');
    expect(await d.load('1')).toBeNull();
});

test('clear com onlyIfHtml: save confirmado de texto antigo não apaga rascunho mais recente', async () => {
    const d = createDrafts(memKv());
    await d.save('1', '<p>novo</p>');
    await d.clear('1', '<p>antigo</p>');
    expect((await d.load('1'))?.html).toBe('<p>novo</p>');
    await d.clear('1', '<p>novo</p>');
    expect(await d.load('1')).toBeNull();
});

test('kv a falhar nunca lança', async () => {
    const boom = async () => { throw new Error('x'); };
    const d = createDrafts({ get: boom, set: boom, del: boom });
    await d.save('1', 'a');
    expect(await d.load('1')).toBeNull();
    await d.clear('1');
    await d.clear('1', 'a');
});

test('isRecoverable: só se difere do servidor', () => {
    expect(isRecoverable(null, 'a')).toBe(false);
    expect(isRecoverable({ html: 'a', ts: 1 }, 'a')).toBe(false);
    expect(isRecoverable({ html: 'b', ts: 1 }, 'a')).toBe(true);
    expect(isRecoverable({ html: '', ts: 1 }, 'a')).toBe(false);
});
