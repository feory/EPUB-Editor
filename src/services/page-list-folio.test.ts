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

test('fillFolioGaps: front-matter romano antes do 1º folio fica sempre null (1º folio não bate certo com a posição física)', () => {
    expect(fillFolioGaps([null, null, 1, 2])).toEqual([null, null, 1, 2]);
});

test('fillFolioGaps: preenche o início quando o 1º folio bate certo com a posição física (ficha técnica/rosto sem folio impresso)', () => {
    // folio "8" na 8ª página física (idx 7) → mesma sequência arábica contínua desde a página 1
    expect(fillFolioGaps([null, null, null, null, null, null, null, 8, 9]))
        .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('fillFolioGaps: não preenche o início se o 1º folio não bater certo com a posição física', () => {
    // folio "8" na 3ª página física (idx 2) — front-matter com esquema próprio, não dá para adivinhar
    expect(fillFolioGaps([null, null, 8, 9])).toEqual([null, null, 8, 9]);
});

test('fillFolioGaps: sem folios detetados, devolve tudo null', () => {
    expect(fillFolioGaps([null, null, null])).toEqual([null, null, null]);
});
