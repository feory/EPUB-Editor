import { test, expect } from 'bun:test';
import { applyBookRule, readCustomStyle, updateCustomStyle, renameCustomStyle, deleteCustomStyle, createCustomStyle, forExport, forEditor } from './book-css';
import { charStyles, paragraphStyles } from './user-styles';

const EDITOR = '/* === EDITOR (não exportado para EPUB) === */';
const create = (css: string, cls: string, body: string) => {
    const r = createCustomStyle(css, cls, body);
    if ('error' in r) throw new Error(r.error);
    return r.css;
};

test('createCustomStyle: cria a secção e acrescenta sem tocar noutras', () => {
    let css = create('p { margin: 0; }\n', 'p-a', 'text-align: right;');
    expect(paragraphStyles.list(css)).toEqual(['p-a']);
    css += '\n/* === OUTRA === */\n.x { color: red; }\n';
    css = create(css, 'p-b', 'color: blue;');
    expect(paragraphStyles.list(css)).toEqual(['p-a', 'p-b']);
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
    expect(paragraphStyles.list(css)).toEqual(['p-a', 'p-b']);
    expect(css.indexOf('.p-b')).toBeLessThan(css.indexOf('EDITOR (não'));
    // livro com a secção já depois do marcador (versão anterior)
    const legacy = `${base}\n    /* === ESTILOS PERSONALIZADOS === */\n    .p-x { color: red; }\n`;
    const fixed = create(legacy, 'p-y', 'color: blue;');
    expect(paragraphStyles.list(fixed)).toEqual(['p-x', 'p-y']);
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
    const first = createCustomStyle('body { }', 'p-nota', 'color: red;');
    if (!('css' in first)) throw new Error(first.error);
    const second = createCustomStyle(first.css, 'c-destaque', 'font-weight: bold;');
    if (!('css' in second)) throw new Error(second.error);
    expect(charStyles.list(second.css)).toEqual(['c-destaque']);
    expect(paragraphStyles.list(second.css)).toEqual(['p-nota']);
});

test('editar e apagar um estilo personalizado: lê, troca as declarações, recusa vazio/inexistente, apaga só essa regra', () => {
    const a = createCustomStyle('body { color: black; }', 'c-destaque', 'font-weight: bold;');
    if (!('css' in a)) throw new Error(a.error);
    const b = createCustomStyle(a.css, 'c-nota', 'color: red;');
    if (!('css' in b)) throw new Error(b.error);
    expect(readCustomStyle(b.css, 'c-destaque')).toBe('font-weight: bold;');
    const upd = updateCustomStyle(b.css, 'c-destaque', 'font-style: italic; color: #c00;');
    if (!('css' in upd)) throw new Error(upd.error);
    expect(readCustomStyle(upd.css, 'c-destaque')).toBe('font-style: italic; color: #c00;');
    expect(readCustomStyle(upd.css, 'c-nota')).toBe('color: red;');
    expect(updateCustomStyle(b.css, 'c-destaque', '  ')).toEqual({ error: 'Define pelo menos uma declaração.' });
    expect('error' in updateCustomStyle(b.css, 'c-nao-existe', 'color: red;')).toBe(true);
    const del = deleteCustomStyle(upd.css, 'c-destaque');
    expect(charStyles.list(del)).toEqual(['c-nota']);
    expect(del).toContain('body { color: black; }');
});

test('renameCustomStyle: troca a classe mantendo o corpo; recusa nome existente ou estilo inexistente', () => {
    const a = createCustomStyle('body { }', 'c-a', 'font-weight: bold;');
    if (!('css' in a)) throw new Error(a.error);
    const b = createCustomStyle(a.css, 'c-b', 'color: red;');
    if (!('css' in b)) throw new Error(b.error);
    const r = renameCustomStyle(b.css, 'c-a', 'c-novo');
    if (!('css' in r)) throw new Error(r.error);
    expect(charStyles.list(r.css)).toEqual(['c-novo', 'c-b']);
    expect(readCustomStyle(r.css, 'c-novo')).toBe('font-weight: bold;');
    expect(renameCustomStyle(b.css, 'c-a', 'c-b')).toEqual({ error: 'Já existe um estilo ".c-b".' });
    expect('error' in renameCustomStyle(b.css, 'c-nao', 'c-x')).toBe(true);
});

test('applyBookRule: a regra nova fica ANTES do marcador do editor e sai no export', () => {
    const base = `p { margin: 0; }\n\n    ${EDITOR}\n    hr.chapter-break { border: 0; }\n`;
    const css = applyBookRule(base, 'h3', [['margin-top', '2em']]);
    expect(css.indexOf('h3 { margin-top: 2em; }')).toBeLessThan(css.indexOf('EDITOR (não'));
    expect(css).toContain('hr.chapter-break { border: 0; }');
    expect(forExport(css)).toContain('h3 { margin-top: 2em; }');
});

test('applyBookRule: a regra que um livro já tem DEPOIS do marcador passa para antes (e mantém as outras declarações)', () => {
    const base = `p { margin: 0; }\n\n    ${EDITOR}\n    hr.chapter-break { border: 0; }\n\n    h3 { margin-top: 2em; color: red; }\n`;
    expect(forExport(base)).not.toContain('h3 {'); // o bug: o export cortava-a
    const css = applyBookRule(base, 'h3', [['font-size', '1.2em']]);
    expect(css.indexOf('h3 {')).toBeLessThan(css.indexOf('EDITOR (não'));
    expect(css.match(/h3 \{/g)).toHaveLength(1);
    expect(forExport(css)).toMatch(/h3 \{[^}]*margin-top: 2em[^}]*color: red[^}]*font-size: 1.2em/);
});

test('applyBookRule: regra que já está antes do marcador fica onde está; sem marcador acrescenta ao fim', () => {
    const before = `h3 { color: red; }\n\n    ${EDITOR}\n    hr.chapter-break { border: 0; }\n`;
    const out = applyBookRule(before, 'h3', [['margin-top', '2em']]);
    expect(out.indexOf('h3 {')).toBeLessThan(out.indexOf('EDITOR (não'));
    expect(out).toContain('h3 { color: red; margin-top: 2em; }');
    expect(applyBookRule('p { margin: 0; }\n', 'h3', [['margin-top', '2em']])).toContain('h3 { margin-top: 2em; }');
});
