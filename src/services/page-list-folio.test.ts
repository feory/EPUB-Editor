import { test, expect } from 'bun:test';
import { fillFolioGaps } from './page-list-folio';

test('fillFolioGaps: interpola 1 página em falta (abertura de capítulo sem folio)', () => {
    expect(fillFolioGaps([40, null, 42, 43])).toEqual([40, 41, 42, 43]);
});

test('fillFolioGaps: interpola vários gaps consecutivos', () => {
    expect(fillFolioGaps([10, null, null, 13, 14])).toEqual([10, 11, 12, 13, 14]);
});

test('fillFolioGaps: gap que não bate certo (caderno sem numeração) fica por preencher', () => {
    expect(fillFolioGaps([20, null, null, 25])).toEqual([20, null, null, 25]);
});

test('fillFolioGaps: front-matter romano antes do 1º folio fica sempre null', () => {
    expect(fillFolioGaps([null, null, 1, 2])).toEqual([null, null, 1, 2]);
});

test('fillFolioGaps: sem folios detetados, devolve tudo null', () => {
    expect(fillFolioGaps([null, null, null])).toEqual([null, null, null]);
});
