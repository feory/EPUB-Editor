import { test, expect } from 'bun:test';
import { isCharStyle, charStyleClassOf, charStyleLabel, charStyleFormat } from './char-styles';

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
