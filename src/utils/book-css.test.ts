import { test, expect } from 'bun:test';
import { styleClassOf, charStyleClassOf, listCharStyles, listCustomStyles, createCustomStyle, forExport, forEditor } from './book-css';

const EDITOR = '/* === EDITOR (não exportado para EPUB) === */';
const create = (css: string, cls: string, body: string) => {
    const r = createCustomStyle(css, cls, body);
    if ('error' in r) throw new Error(r.error);
    return r.css;
};

test('styleClassOf: slug com prefixo p-', () => {
    expect(styleClassOf('Epígrafe final')).toBe('p-epigrafe-final');
    expect(styleClassOf('p-nota')).toBe('p-nota');
    expect(styleClassOf('!!!')).toBe('');
});

test('createCustomStyle: cria a secção e acrescenta sem tocar noutras', () => {
    let css = create('p { margin: 0; }\n', 'p-a', 'text-align: right;');
    expect(listCustomStyles(css)).toEqual(['p-a']);
    css += '\n/* === OUTRA === */\n.x { color: red; }\n';
    css = create(css, 'p-b', 'color: blue;');
    expect(listCustomStyles(css)).toEqual(['p-a', 'p-b']);
    expect(css).toContain('.x { color: red; }');
    expect(css.indexOf('.p-b')).toBeLessThan(css.indexOf('OUTRA'));
});

test('createCustomStyle: recusa uma classe que já existe', () => {
    const css = create('p { margin: 0; }\n', 'p-a', 'color: red;');
    expect(createCustomStyle(css, 'p-a', 'color: blue;')).toEqual({ error: 'Já existe um estilo ".p-a".' });
});

test('createCustomStyle: a secção fica antes do marcador do editor (e migra se estava depois)', () => {
    const base = `p { margin: 0; }\n\n    ${EDITOR}\n    hr.chapter-break { border: 0; }\n`;
    let css = create(base, 'p-a', 'color: red;');
    expect(css.indexOf('.p-a')).toBeLessThan(css.indexOf('EDITOR (não'));
    css = create(css, 'p-b', 'color: blue;');
    expect(listCustomStyles(css)).toEqual(['p-a', 'p-b']);
    expect(css.indexOf('.p-b')).toBeLessThan(css.indexOf('EDITOR (não'));
    // livro com a secção já depois do marcador (versão anterior)
    const legacy = `${base}\n    /* === ESTILOS PERSONALIZADOS === */\n    .p-x { color: red; }\n`;
    const fixed = create(legacy, 'p-y', 'color: blue;');
    expect(listCustomStyles(fixed)).toEqual(['p-x', 'p-y']);
    expect(fixed.indexOf('.p-x')).toBeLessThan(fixed.indexOf('EDITOR (não'));
    expect(fixed).toContain('hr.chapter-break');
});

test('forExport: corta a parte só-editor mas mantém os estilos personalizados (mesmo depois do marcador)', () => {
    const legacy = `p { margin: 0; }\n${EDITOR}\nhr.chapter-break { border: 0; }\n\n    /* === ESTILOS PERSONALIZADOS === */\n    .p-a { text-align: right; }\n`;
    const out = forExport(legacy);
    expect(out).toContain('.p-a { text-align: right; }');
    expect(out).not.toContain('chapter-break');
    expect(out).not.toContain('EDITOR (não');
});

test('forExport: sem marcador devolve o CSS e acrescenta as regras-base do export', () => {
    const out = forExport('p { margin: 0; }');
    expect(out).toContain('p { margin: 0; }');
    expect(out).toContain('.small-caps'); // regra-base só do export
});

test('forEditor: corrige livros antigos (fonte relativa, prefixo do marcador de capítulo)', () => {
    const old = 'src: url("Fonts/CrimsonText-Regular.ttf"); content: "Capítulo - " attr(data-title);';
    const out = forEditor(old);
    expect(out).toContain('url("/CrimsonText-Regular.ttf")');
    expect(out).toContain('content: attr(data-title)');
    expect(out).not.toContain('Capítulo - ');
});

test('forEditor: todas as fontes relativas antigas viram absolutas', () => {
    const css = `@font-face { font-family: "Crimson Text"; src: url("Fonts/CrimsonText-Regular.ttf"); }
@font-face { font-family: "Crimson Text"; src: url("Fonts/CrimsonText-BoldItalic.ttf"); }`;
    const patched = forEditor(css);
    expect(patched).toContain('url("/CrimsonText-Regular.ttf")');
    expect(patched).toContain('url("/CrimsonText-BoldItalic.ttf")');
    expect(patched).not.toContain('Fonts/');
});

test('forEditor: é idempotente (compara com a 1.ª passagem: os patches acrescentam regras em falta)', () => {
    const once = forEditor('@font-face { font-family: "Crimson Text"; src: url("/CrimsonText-Regular.ttf"); }');
    expect(once).toContain('url("/CrimsonText-Regular.ttf")');
    expect(forEditor(once)).toBe(once);
});

test('estilos de caracteres: c- à parte dos de parágrafo na mesma secção', () => {
    expect(charStyleClassOf('Destaque forte')).toBe('c-destaque-forte');
    expect(charStyleClassOf('  ')).toBe('');
    const first = createCustomStyle('body { }', 'p-nota', 'color: red;');
    if (!('css' in first)) throw new Error(first.error);
    const second = createCustomStyle(first.css, 'c-destaque', 'font-weight: bold;');
    if (!('css' in second)) throw new Error(second.error);
    expect(listCharStyles(second.css)).toEqual(['c-destaque']);
    expect(listCustomStyles(second.css)).toEqual(['p-nota']);
});
