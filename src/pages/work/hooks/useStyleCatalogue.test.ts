import { test, expect } from 'bun:test';
import { createStyleCatalogue } from './useStyleCatalogue';
import { charStyles, boxStyles } from '../../../utils/user-styles';

const setup = (saveError: string | null = null) => {
    const calls: string[] = [];
    const catalogue = createStyleCatalogue(
        { createStyle: (cls) => { calls.push(`css.create ${cls}`); return null; }, saveStyle: (cls, _b, n) => { calls.push(`css.save ${cls}>${n}`); return saveError; }, deleteStyle: (cls) => { calls.push(`css.delete ${cls}`); } },
        { renameStyle: (k, f, t) => { calls.push(`book.rename ${k === charStyles ? 'char' : 'box'} ${f}>${t}`); }, removeStyle: (k, c) => { calls.push(`book.remove ${k === charStyles ? 'char' : 'box'} ${c}`); } },
    );
    return { calls, catalogue };
};

test('save: CSS primeiro, depois o HTML (só se o nome mudou)', () => {
    const { calls, catalogue } = setup();
    expect(catalogue.char.save('c-a', 'color: red;', 'c-b')).toBeNull();
    expect(calls).toEqual(['css.save c-a>c-b', 'book.rename char c-a>c-b']);
});

test('save sem mudar o nome não toca no HTML', () => {
    const { calls, catalogue } = setup();
    catalogue.box.save('b-a', 'color: red;', 'b-a');
    expect(calls).toEqual(['css.save b-a>b-a']);
});

test('save com erro no CSS pára sem tocar no HTML e devolve o erro', () => {
    const { calls, catalogue } = setup('Já existe um estilo ".c-b".');
    expect(catalogue.char.save('c-a', 'x', 'c-b')).toBe('Já existe um estilo ".c-b".');
    expect(calls).toEqual(['css.save c-a>c-b']);
});

test('remove: apaga no CSS e retira do HTML do tipo certo', () => {
    const { calls, catalogue } = setup();
    catalogue.box.remove('b-a');
    expect(calls).toEqual(['css.delete b-a', 'book.remove box b-a']);
});

test('create vai só ao CSS; há um StyleSet por tipo', () => {
    const { calls, catalogue } = setup();
    catalogue.paragraph.create('p-a', 'color: red;');
    expect(calls).toEqual(['css.create p-a']);
    expect(Object.keys(catalogue).sort()).toEqual(['box', 'char', 'paragraph']);
    void boxStyles;
});
