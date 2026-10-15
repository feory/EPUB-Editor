import { test, expect } from 'bun:test';
import { isPlaceholderAlt } from './image-alt';

test('isPlaceholderAlt: vazio e textos genéricos são placeholder; texto do utilizador não', () => {
    for (const a of ['', '  ', null, undefined, 'Imagem', 'Imagem importada']) expect(isPlaceholderAlt(a)).toBe(true);
    for (const a of ['Mapa de Moçambique', 'Imagem 3']) expect(isPlaceholderAlt(a)).toBe(false);
});
