import { test, expect } from 'bun:test';
import { chapterTitleOf } from './chapter-title';

test('chapterTitleOf: título normal passa (com espaços aparados)', () => {
    expect(chapterTitleOf('  Capítulo 1. Introdução ', 'OEBPS/1.xhtml')).toBe('Capítulo 1. Introdução');
});

test('chapterTitleOf: nome do ficheiro (InDesign sem título) não é título', () => {
    expect(chapterTitleOf('Porque_falham_as_equipas_ebook-1', 'OEBPS/Porque_falham_as_equipas_ebook-1.xhtml')).toBe('');
});

test('chapterTitleOf: vazio ou sem letras/números não é título', () => {
    expect(chapterTitleOf('', 'a.xhtml')).toBe('');
    expect(chapterTitleOf('.', 'a.xhtml')).toBe('');
    expect(chapterTitleOf(' *** ', 'a.xhtml')).toBe('');
});
