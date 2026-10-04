/**
 * Testa a geometria pura por trás do reposicionamento do mini-menu — extraída
 * de useBlockOverlays.tsx especificamente para ser testável sem DOM real (happy-dom não
 * calcula layout, por isso um teste baseado em getBoundingClientRect não verificaria nada).
 */
import { test, expect } from 'bun:test';
import { placePopover } from '../useBlockOverlays';

// --- placePopover --------------------------------------------------------------------------

test('placePopover: cabe acima do bloco → side "top"', () => {
    // bloco a 200-220 (top-bottom), pop com 100px, iframe começa em 0 → 200-100-4=96 >= 0+4 ✓
    const r = placePopover(200, 220, true, 100, 0, 800);
    expect(r).toEqual({ top: 96, side: 'top' });
});

test('placePopover: sem espaço acima, cabe abaixo → side "bottom"', () => {
    // bloco perto do topo do iframe: 10-30, pop 100px → desiredTop=10-100-4=-94 < 0+4, falha acima
    const r = placePopover(10, 30, true, 100, 0, 800);
    expect(r).toEqual({ top: 34, side: 'bottom' }); // 30 + 4: encostado à linha da borda
});

test('placePopover: não cabe em lado nenhum → null', () => {
    // iframe pequeno (120px), bloco ocupa quase tudo — nem acima nem abaixo há 100px livres
    const r = placePopover(10, 110, true, 100, 0, 120);
    expect(r).toBeNull();
});

test('placePopover: bloco fora da área visível → null mesmo que a matemática coubesse', () => {
    const r = placePopover(200, 220, false, 100, 0, 800);
    expect(r).toBeNull();
});
