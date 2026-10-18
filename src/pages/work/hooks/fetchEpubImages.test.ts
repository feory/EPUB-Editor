import { test, expect } from 'bun:test';
import { collectImageIds, fetchImages } from './fetchEpubImages';

test('collectImageIds: sem repetidas, data-image-id antes de src, ignora querystring', () => {
    const html = '<img data-image-id="b"><img src="/api/ebooks/123/images/a?thumb=1"><img data-image-id="b"><img src="/api/ebooks/123/images/c">';
    expect(collectImageIds(html)).toEqual(['b', 'a', 'c']);
});

test('fetchImages: mantém a ordem, salta falhas e nunca passa do limite de pedidos simultâneos', async () => {
    let inFlight = 0, peak = 0;
    const get = async (id: string) => {
        inFlight++; peak = Math.max(peak, inFlight);
        await new Promise(r => setTimeout(r, id === 'a' ? 15 : 1)); // o 1.º demora mais: ordem != ordem de chegada
        inFlight--;
        if (id === 'x') throw new Error('404');
        return new Blob([id]);
    };
    const ids = ['a', 'b', 'x', 'c', 'd', 'e', 'f', 'g'];
    const map = await fetchImages(ids, get, 3);
    expect([...map.keys()]).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
});
