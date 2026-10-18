import { test, expect } from 'bun:test';
import { splitChapters, splitChapterSegments, countChapterMarkers, matchChapterBoundary, classifyChapterPart, insertChapterMarkers } from './chapters';

const BOOK = '<p>Ficha</p>'
    + '<p class="chapter-break-h1" data-title="Um"></p><h1>Um</h1><p>a</p>'
    + '<hr class="chapter-break" data-title="Legacy"><p>b</p>'
    + '<p class="chapter-break" data-title="Sem título"></p><p>c</p>';

test('splitChapterSegments: join dá o HTML original (a propriedade que os editores de segmento usam)', () => {
    expect(splitChapterSegments(BOOK).join('')).toBe(BOOK);
    expect(splitChapterSegments(BOOK)).toHaveLength(4);
});

test('splitChapters: sem partes vazias; índice == índice em chapters[]', () => {
    expect(splitChapters('')).toEqual([]);
    expect(splitChapters(`  ${BOOK}`)).toHaveLength(4);
    expect(countChapterMarkers(BOOK)).toBe(2); // só <p> marcadores; o hr legacy conta-se à parte
});

test('matchChapterBoundary: marcador <p> e <hr> legacy, com o data-title raw', () => {
    expect(matchChapterBoundary('<p class="chapter-break-h2" data-title="A &amp; B"></p><h2>x</h2>')).toMatchObject({ level: 'h2', title: 'A &amp; B', legacyHr: false });
    expect(matchChapterBoundary('<hr class="chapter-break" data-title="L"><p>x</p>')).toMatchObject({ level: null, title: 'L', legacyHr: true });
    expect(matchChapterBoundary('<p>sem fronteira</p>')).toBeNull();
});

test('classifyChapterPart + insertChapterMarkers: o marcador inserido antes do heading dá título e nível', () => {
    const [part] = splitChapters(insertChapterMarkers('<h1>Capítulo 1<br>Início</h1><p>x</p>'));
    expect(classifyChapterPart(part, 0)).toEqual({ title: 'Capítulo 1 Início', level: 'h1' });
});

test('data-title com apóstrofo não é truncado (marcador <p>, <hr> legacy e classifyChapterPart)', () => {
    expect(matchChapterBoundary(`<p class="chapter-break-h1" data-title="D'Artagnan"></p><h1>x</h1>`)?.title).toBe("D'Artagnan");
    expect(matchChapterBoundary(`<hr class="chapter-break" data-title="O'Neil">`)?.title).toBe("O'Neil");
    expect(matchChapterBoundary(`<p class="chapter-break-h1" data-title='Diz "sim"'></p>`)?.title).toBe('Diz "sim"');
    expect(classifyChapterPart(`<p class="chapter-break-h1" data-title="D'Artagnan"></p><h1>D'Artagnan</h1>`, 0).title).toBe("D'Artagnan");
});
