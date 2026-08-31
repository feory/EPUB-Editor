/**
 * Testa a geometria pura por trás do "+"/pega e do reposicionamento do mini-menu — extraída
 * de useBlockOverlays.tsx especificamente para ser testável sem DOM real (happy-dom não
 * calcula layout, por isso um teste baseado em getBoundingClientRect não verificaria nada).
 */
import { test, expect } from 'bun:test';
import { findHitBlock, placePopover } from '../useBlockOverlays';

// --- findHitBlock ------------------------------------------------------------------------

type Block = { id: string; bottom: number };
const byBottom = (b: Block) => b.bottom;
const always = () => true;

test('findHitBlock: bloco cujo bottom está dentro da banda é escolhido', () => {
    const blocks: Block[] = [{ id: 'a', bottom: 100 }];
    expect(findHitBlock(blocks, byBottom, 110, 40, always)?.id).toBe('a');
});

test('findHitBlock: não sai no 1º match — fica com o mais próximo (bottom maior) ainda dentro da banda', () => {
    const blocks: Block[] = [{ id: 'a', bottom: 80 }, { id: 'b', bottom: 95 }, { id: 'c', bottom: 98 }];
    // mouseY=100, band=40 → todos os 3 estão na banda (>= 60); fica com 'c' (o último, mais próximo).
    expect(findHitBlock(blocks, byBottom, 100, 40, always)?.id).toBe('c');
});

test('findHitBlock: para assim que ultrapassa a zona do rato — blocos seguintes nunca são lidos', () => {
    // 'over-band' já excede mouseY+band (200 > 140) → break; 'never' não pode ser avaliado depois.
    const blocks: Block[] = [{ id: 'a', bottom: 50 }, { id: 'over-band', bottom: 200 }, { id: 'never', bottom: 999 }];
    let neverRead = false;
    const getBottom = (b: Block) => { if (b.id === 'never') neverRead = true; return b.bottom; };
    findHitBlock(blocks, getBottom, 100, 40, always);
    expect(neverRead).toBe(false);
});

test('findHitBlock: bloco na banda mas inelegível não sobrepõe um hit eligível anterior', () => {
    const blocks: Block[] = [{ id: 'eligible', bottom: 90 }, { id: 'ineligible', bottom: 95 }];
    const isEligible = (b: Block) => b.id === 'eligible';
    expect(findHitBlock(blocks, byBottom, 100, 40, isEligible)?.id).toBe('eligible');
});

test('findHitBlock: nenhum bloco na banda → null', () => {
    const blocks: Block[] = [{ id: 'a', bottom: 10 }];
    expect(findHitBlock(blocks, byBottom, 100, 40, always)).toBeNull();
});

// --- placePopover --------------------------------------------------------------------------

test('placePopover: cabe acima do bloco → side "top"', () => {
    // bloco a 200-220 (top-bottom), pop com 100px, iframe começa em 0 → 200-100-8=92 >= 0+4 ✓
    const r = placePopover(200, 220, true, 100, 0, 800);
    expect(r).toEqual({ top: 92, side: 'top' });
});

test('placePopover: sem espaço acima, cabe abaixo → side "bottom"', () => {
    // bloco perto do topo do iframe: 10-30, pop 100px → desiredTop=10-100-8=-98 < 0+4, falha acima
    const r = placePopover(10, 30, true, 100, 0, 800);
    expect(r).toEqual({ top: 38, side: 'bottom' });
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
