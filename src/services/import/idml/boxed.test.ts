import { test, expect } from 'bun:test';
import { isWhite, isNumeral, boxedNumeralHtml, unboxWhite } from './boxed';

test('isNumeral: romano e algarismos sozinhos; texto não', () => {
    expect(['V', 'xiv', '12', ' IV '].every(isNumeral)).toBe(true);
    expect(['', 'AGORA', '1.º', 'V AGORA'].some(isNumeral)).toBe(false);
    expect(isWhite('rgb(255,255,255)')).toBe(true);
    expect(isWhite('rgb(0,0,0)')).toBe(false);
});

test('unboxWhite: desembrulha o branco sem deixar <span> nu; a caixa do numeral só sai se o bloco todo é preto', () => {
    const line = `${boxedNumeralHtml('1')}<br><span style="color:rgb(255,255,255)">O DOUTOR</span>`;
    expect(unboxWhite(line, false)).toBe(`${boxedNumeralHtml('1')}<br>O DOUTOR`);
    expect(unboxWhite(line, true)).toBe('1<br>O DOUTOR');
});
