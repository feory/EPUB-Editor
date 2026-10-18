import { test, expect } from 'bun:test';
import { sendOnUnload, KEEPALIVE_MAX_BYTES } from './sendOnUnload';

const capture = () => {
    const calls: RequestInit[] = [];
    const fake = (async (_url: string, init: RequestInit) => { calls.push(init); return new Response(); }) as unknown as typeof fetch;
    return { calls, fake };
};

test('sendOnUnload: keepalive só quando o corpo cabe no limite dos browsers (~64 KB)', () => {
    const small = capture();
    sendOnUnload('1', '<p>curto</p>', small.fake);
    expect(small.calls[0].keepalive).toBe(true);

    // texto pouco comprimível → corpo gzip+base64 bem acima do limite
    const big = capture();
    const noise = Array.from({ length: 200_000 }, () => Math.random().toString(36).slice(2, 4)).join('');
    sendOnUnload('1', `<p>${noise}</p>`, big.fake);
    expect((big.calls[0].body as string).length).toBeGreaterThan(KEEPALIVE_MAX_BYTES);
    expect(big.calls[0].keepalive).toBe(false);
});
