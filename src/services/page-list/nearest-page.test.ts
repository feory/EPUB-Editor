import { test, expect } from 'bun:test';
import { pickFolio, nearestPdfPage } from './nearest-page';

const M = [{ page: 10, top: -300 }, { page: 11, top: 100 }, { page: 12, top: 900 }];

test('pickFolio: último marcador já começado; antes do primeiro → o primeiro; sem marcadores → null', () => {
    expect(pickFolio(M, 0)).toBe(10);
    expect(pickFolio(M, 100)).toBe(11);
    expect(pickFolio(M, 5000)).toBe(12);
    expect(pickFolio([{ page: 7, top: 50 }, { page: 8, top: 400 }], 0)).toBe(7); // ainda antes do 1.º
    expect(pickFolio([], 0)).toBeNull();
});

test('nearestPdfPage: exato; senão o folio mais próximo (empate → o anterior); sem mapa → undefined', () => {
    const map = new Map([[1, 5], [10, 14], [20, 24]]);
    expect(nearestPdfPage(map, 10)).toBe(14);
    expect(nearestPdfPage(map, 12)).toBe(14);
    expect(nearestPdfPage(map, 18)).toBe(24);
    expect(nearestPdfPage(map, 15)).toBe(14); // 5 de 10 e 5 de 20 → anterior
    expect(nearestPdfPage(map, 999)).toBe(24);
    expect(nearestPdfPage(new Map(), 3)).toBeUndefined();
});
