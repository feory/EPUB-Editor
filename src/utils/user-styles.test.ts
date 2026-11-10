import { test, expect } from 'bun:test';
import { USER_STYLES, charStyles, boxStyles, paragraphStyles } from './user-styles';
import { createCustomStyle } from './book-css';
import '../services/indesign/happy-dom';

test('classOf: slug com o prefixo do tipo, sem acentos nem duplicar o prefixo; vazio dá ""', () => {
    expect(charStyles.classOf('Destaque forte')).toBe('c-destaque-forte');
    expect(charStyles.classOf('Épígrafe')).toBe('c-epigrafe');
    expect(charStyles.classOf('c-nota')).toBe('c-nota');
    expect(boxStyles.classOf('Destaque Azul')).toBe('b-destaque-azul');
    expect(paragraphStyles.classOf('Epígrafe final')).toBe('epigrafe-final');
    for (const kind of Object.values(USER_STYLES)) expect(kind.classOf('  !!! ')).toBe('');
});

test('isStyle / label: a convenção num só sítio', () => {
    expect(charStyles.isStyle('c-nota')).toBe(true);
    expect(charStyles.isStyle('p-nota')).toBe(false);
    expect(charStyles.label('c-nota')).toBe('nota');
    expect(boxStyles.isStyle('b-nota')).toBe(true);
    expect(boxStyles.label('b-nota')).toBe('nota');
    expect(paragraphStyles.isStyle('p-nota')).toBe(true);
    expect(paragraphStyles.isStyle('c-nota') || paragraphStyles.isStyle('b-nota')).toBe(false);
    expect(paragraphStyles.label('p-nota')).toBe('p-nota');
});

test('clone: -copia, depois -copia-2, -copia-3…', () => {
    for (const [kind, cls] of [[charStyles, 'c-x'], [boxStyles, 'b-x'], [paragraphStyles, 'p-x']] as const) {
        expect(kind.clone([cls], cls)).toBe(`${cls}-copia`);
        expect(kind.clone([cls, `${cls}-copia`], cls)).toBe(`${cls}-copia-2`);
        expect(kind.clone([cls, `${cls}-copia`, `${cls}-copia-2`], cls)).toBe(`${cls}-copia-3`);
    }
});

test('list: cada tipo só vê as suas classes na secção do livro', () => {
    let css = '/* x */';
    for (const cls of ['p-um', 'c-dois', 'b-tres']) css = (createCustomStyle(css, cls, 'color: red;') as { css: string }).css;
    expect(paragraphStyles.list(css)).toEqual(['p-um']);
    expect(charStyles.list(css)).toEqual(['c-dois']);
    expect(boxStyles.list(css)).toEqual(['b-tres']);
});

test('caracteres.removeFromHtml: desembrulha o span só desse estilo, mantém os outros atributos e estilos', () => {
    const html = '<p>a <span class="c-x">b</span> c <span class="c-x c-y">d</span> e <span class="c-x" style="color: red">f</span> <span class="c-y">g</span></p>';
    expect(charStyles.removeFromHtml(html, 'c-x')).toBe('<p>a b c <span class="c-y">d</span> e <span style="color: red">f</span> <span class="c-y">g</span></p>');
    const plain = '<p>sem estilo</p>';
    expect(charStyles.removeFromHtml(plain, 'c-x')).toBe(plain);
});

test('caixa.removeFromHtml / renameInHtml: só nas caixas', () => {
    const html = '<div class="box b-x box--nota"><p>a</p></div><p class="b-x">fora</p>';
    expect(boxStyles.removeFromHtml(html, 'b-x')).toBe('<div class="box box--nota"><p>a</p></div><p class="b-x">fora</p>');
    expect(boxStyles.renameInHtml(html, 'b-x', 'b-y')).toBe('<div class="box b-y box--nota"><p>a</p></div><p class="b-x">fora</p>');
});

test('parágrafo.removeFromHtml / renameInHtml: em qualquer elemento, tira o atributo class vazio', () => {
    const html = '<p class="p-x">a</p><h2 class="p-center p-x">b</h2>';
    expect(paragraphStyles.removeFromHtml(html, 'p-x')).toBe('<p>a</p><h2 class="p-center">b</h2>');
    expect(paragraphStyles.renameInHtml(html, 'p-x', 'p-y')).toBe('<p class="p-y">a</p><h2 class="p-center p-y">b</h2>');
});

test('renameInHtml: troca só essa classe; sem uso devolve o mesmo html', () => {
    const html = '<p><span class="c-x">a</span> <span class="c-x c-y" style="color: red">b</span> <span class="c-x-copia">c</span></p>';
    expect(charStyles.renameInHtml(html, 'c-x', 'c-z')).toBe('<p><span class="c-z">a</span> <span class="c-z c-y" style="color: red">b</span> <span class="c-x-copia">c</span></p>');
    const plain = '<p>nada</p>';
    for (const kind of Object.values(USER_STYLES)) {
        expect(kind.removeFromHtml(plain, 'c-x')).toBe(plain);
        expect(kind.renameInHtml(plain, 'c-x', 'c-z')).toBe(plain);
    }
});
