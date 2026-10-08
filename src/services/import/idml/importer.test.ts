import { test, expect } from 'bun:test';

// idml/importer.ts importa page-list.ts, que por sua vez importa pdfjs-dist a mostrar da
// mesma limitacao que log-activity.test.js documenta para database.js: um efeito colateral de
// nivel de modulo (pdfjs-dist referencia DOMMatrix, global so-browser) rebenta so por
// IMPORTAR o ficheiro, mesmo sem chamar nada relacionado com PDF. Stub minimo + import()
// dinamico (adia a avaliacao do modulo para depois do stub existir) em vez de import estatico.
(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
const { cleanText, collapseHyphenBreaks, stripRedundantEmphasis } = await import('./importer');

test('cleanText: tira hifen mole (U+00AD) e normaliza separadores de linha/tab', () => {
    expect(cleanText('Romano­-Germanico')).toBe('Romano-Germanico');
    expect(cleanText('a b c\td')).toBe('a b c d');
});

test('collapseHyphenBreaks: palavra composta partida na quebra de linha do InDesign vira um so hifen', () => {
    // "Romano<hifen mole>-<quebra de linha>-Germanico" - ja sem hifen mole e ja com a quebra
    // de linha convertida em espaco (ambos feitos por cleanText, antes disto).
    expect(collapseHyphenBreaks('Sacro Imperio Romano- -Germanico')).toBe('Sacro Imperio Romano-Germanico');
});

test('collapseHyphenBreaks: palavra partida entre dois CharacterStyleRange (concatenacao de runs)', () => {
    // "Saint-<quebra>-" (1o run) + "Aubin-du-Cormier" (2o run, formatacao diferente) - sem tag
    // entre os dois, mesma limitacao real do livro "Escritos Politicos".
    expect(collapseHyphenBreaks('jornada de Saint- -Aubin-du-Cormier (27 de julho')).toBe('jornada de Saint-Aubin-du-Cormier (27 de julho');
});

test('collapseHyphenBreaks: nao mexe num hifen a separar duas palavras distintas', () => {
    expect(collapseHyphenBreaks('cafe - cha')).toBe('cafe - cha');
    expect(collapseHyphenBreaks('um hifen - so')).toBe('um hifen - so');
});

test('stripRedundantEmphasis: p-bold/p-italic tiram strong/b e em/i; sem a classe não mexe', () => {
    expect(stripRedundantEmphasis('<strong>a</strong> <em>b</em>', ['p-bold'])).toBe('a <em>b</em>');
    expect(stripRedundantEmphasis('<b class="x">a</b> <i>b</i>', ['p-italic p-top'])).toBe('<b class="x">a</b> b');
    expect(stripRedundantEmphasis('<strong>a</strong><em>b</em><br>', ['p-bold-italic'])).toBe('ab<br>');
    expect(stripRedundantEmphasis('<strong>a</strong>', ['p-indent'])).toBe('<strong>a</strong>');
});
