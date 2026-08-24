import { test, expect } from 'bun:test';
import { cleanIndexText, linkIndexPages } from './index-cleaner';

test('cleanIndexText: descarta números de página (regressão pós-refactor buildEntries)', () => {
    const raw = 'Segurança psicológica, 12, 45\nConfiança, 34–36';
    expect(cleanIndexText(raw)).toEqual(['Segurança psicológica', 'Confiança']);
});

test('cleanIndexText: crossref colado ao número (mesma linha) continua a separar corretamente', () => {
    const raw = 'Liderança, 100\nConfiança, 34ver também Liderança\nSegurança, 78';
    expect(cleanIndexText(raw)).toEqual(['Liderança', 'Confiança; ver também Liderança', 'Segurança']);
});

test('linkIndexPages: embrulha cada número em idx-link, mantendo o termo e a pontuação', () => {
    const raw = 'Segurança psicológica, 12, 45';
    expect(linkIndexPages(raw)).toEqual([
        'Segurança psicológica, <span class="idx-link" data-target="page-12">12</span>, <span class="idx-link" data-target="page-45">45</span>',
    ]);
});

test('linkIndexPages: intervalo mantém o traço, liga início e fim', () => {
    const raw = 'Confiança, 34–36';
    expect(linkIndexPages(raw)).toEqual([
        'Confiança, <span class="idx-link" data-target="page-34">34</span>–<span class="idx-link" data-target="page-36">36</span>',
    ]);
});

test('linkIndexPages: crossref colado ao número liga a página ao termo, não ao alvo do crossref', () => {
    const raw = 'Confiança, 34ver também Liderança';
    expect(linkIndexPages(raw)).toEqual([
        'Confiança, <span class="idx-link" data-target="page-34">34</span>; ver também Liderança',
    ]);
});

test('linkIndexPages: dígito que faz parte do TERMO (não da lista de páginas) não vira link', () => {
    const raw = 'Web 2.0, 12';
    expect(linkIndexPages(raw)).toEqual([
        'Web 2.0, <span class="idx-link" data-target="page-12">12</span>',
    ]);
});

test('linkIndexPages: escapa caracteres HTML do termo sem afetar o markup do link', () => {
    const raw = 'A & B, 5';
    expect(linkIndexPages(raw)).toEqual([
        'A &amp; B, <span class="idx-link" data-target="page-5">5</span>',
    ]);
});
