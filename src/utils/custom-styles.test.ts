import { test, expect } from 'bun:test';
import { styleClassOf, listCustomStyles, addCustomStyle } from './custom-styles';

test('styleClassOf: slug com prefixo p-', () => {
    expect(styleClassOf('Epígrafe final')).toBe('p-epigrafe-final');
    expect(styleClassOf('p-nota')).toBe('p-nota');
    expect(styleClassOf('!!!')).toBe('');
});

test('addCustomStyle/listCustomStyles: cria a secção e acrescenta sem tocar noutras', () => {
    let css = 'p { margin: 0; }\n';
    css = addCustomStyle(css, 'p-a', 'text-align: right;');
    expect(listCustomStyles(css)).toEqual(['p-a']);
    css += '\n/* === OUTRA === */\n.x { color: red; }\n';
    css = addCustomStyle(css, 'p-b', 'color: blue;');
    expect(listCustomStyles(css)).toEqual(['p-a', 'p-b']);
    expect(css).toContain('.x { color: red; }');
    expect(css.indexOf('.p-b')).toBeLessThan(css.indexOf('OUTRA'));
});

test('addCustomStyle: a secção fica antes do marcador do editor (e migra se estava depois)', () => {
    const base = 'p { margin: 0; }\n\n    /* === EDITOR (não exportado para EPUB) === */\n    hr.chapter-break { border: 0; }\n';
    let css = addCustomStyle(base, 'p-a', 'color: red;');
    expect(css.indexOf('.p-a')).toBeLessThan(css.indexOf('EDITOR (não'));
    css = addCustomStyle(css, 'p-b', 'color: blue;');
    expect(listCustomStyles(css)).toEqual(['p-a', 'p-b']);
    expect(css.indexOf('.p-b')).toBeLessThan(css.indexOf('EDITOR (não'));
    // livro com a secção já depois do marcador (versão anterior)
    const legacy = `${base}\n    /* === ESTILOS PERSONALIZADOS === */\n    .p-x { color: red; }\n`;
    const fixed = addCustomStyle(legacy, 'p-y', 'color: blue;');
    expect(listCustomStyles(fixed)).toEqual(['p-x', 'p-y']);
    expect(fixed.indexOf('.p-x')).toBeLessThan(fixed.indexOf('EDITOR (não'));
    expect(fixed).toContain('hr.chapter-break');
});
