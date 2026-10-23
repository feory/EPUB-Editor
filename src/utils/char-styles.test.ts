import { test, expect } from 'bun:test';
import { isCharStyle, charStyleClassOf, charStyleLabel, charStyleFormat, removeCharStyleFromHtml, cloneCharStyleClass } from './char-styles';
import '../services/indesign/happy-dom';

test('charStyleClassOf: slug com prefixo c-, sem acentos nem duplicar o prefixo; vazio dá ""', () => {
    expect(charStyleClassOf('Destaque forte')).toBe('c-destaque-forte');
    expect(charStyleClassOf('Épígrafe')).toBe('c-epigrafe');
    expect(charStyleClassOf('c-nota')).toBe('c-nota');
    expect(charStyleClassOf('  ')).toBe('');
});

test('isCharStyle / charStyleLabel / charStyleFormat: a convenção num só sítio', () => {
    expect(isCharStyle('c-nota')).toBe(true);
    expect(isCharStyle('p-nota')).toBe(false);
    expect(charStyleLabel('c-nota')).toBe('nota');
    expect(charStyleFormat('c-nota')).toEqual({ inline: 'span', classes: 'c-nota' });
});

test('removeCharStyleFromHtml: desembrulha o span só desse estilo, mantém os outros atributos e os outros estilos', () => {
    const html = '<p>a <span class="c-x">b</span> c <span class="c-x c-y">d</span> e <span class="c-x" style="color: red">f</span> <span class="c-y">g</span></p>';
    expect(removeCharStyleFromHtml(html, 'c-x')).toBe('<p>a b c <span class="c-y">d</span> e <span style="color: red">f</span> <span class="c-y">g</span></p>');
    const plain = '<p>sem estilo</p>';
    expect(removeCharStyleFromHtml(plain, 'c-x')).toBe(plain);
});

test('cloneCharStyleClass: -copia, depois -copia-2, -copia-3…', () => {
    expect(cloneCharStyleClass(['c-x'], 'c-x')).toBe('c-x-copia');
    expect(cloneCharStyleClass(['c-x', 'c-x-copia'], 'c-x')).toBe('c-x-copia-2');
    expect(cloneCharStyleClass(['c-x', 'c-x-copia', 'c-x-copia-2'], 'c-x')).toBe('c-x-copia-3');
});
