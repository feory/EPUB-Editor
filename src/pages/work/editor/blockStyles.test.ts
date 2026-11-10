import { expect, test } from 'bun:test';
import { BLOCK_STYLES, BLOCK_CLASS_STYLES } from './blockStyles';
import { STYLE_FORMATS, BLOCK_STYLE_OPTIONS, MORE_STYLES_PARA, MORE_STYLES_HEAD, PARAGRAPH_QUICK_STYLES } from './config';

const OLD_REGISTERED = ['p-indent', 'p-top', 'p-space', 'footnote', 'drop-cap', 'p-small', 'p-legendas', 'p-bold', 'p-italic', 'p-bold-italic', 'p-uppercase', 'p-quote', 'p-asterisk', 'p-border-top', 'p-border-bottom', 'p-border-sides'];

test('o registo regista os mesmos formatos de classe de antes (e nunca o wrapper box)', () => {
    expect(BLOCK_CLASS_STYLES.map((s) => s.format).sort()).toEqual([...OLD_REGISTERED].sort());
});

test('menu da barra: todos os estilos aparecem, cada formato uma só vez', () => {
    const formats = STYLE_FORMATS.flatMap((g) => g.items.map((i) => i.format));
    expect(new Set(formats).size).toBe(formats.length);
    expect(formats.sort()).toEqual(['h1', 'h2', 'h3', 'p', 'box', ...OLD_REGISTERED].sort());
    expect(STYLE_FORMATS.find((g) => g.title === 'Especial')!.items.find((i) => i.format === 'drop-cap')!.title).toBe('Capitular (Drop Cap)');
});

test('"Mais estilos" e painel do bloco derivam do mesmo registo', () => {
    const para = MORE_STYLES_PARA.map(([f]) => f);
    expect(para.slice(0, 3)).toEqual(['h1', 'h2', 'h3']);
    expect(para).toContain('box');
    expect(para).not.toContain('p-asterisk'); // só na barra
    expect(MORE_STYLES_HEAD[0][0]).toBe('p');
    expect(BLOCK_STYLE_OPTIONS.map(([f]) => f)).not.toContain('box'); // wrapper, não estilo do bloco
    expect(PARAGRAPH_QUICK_STYLES.map(([, l]) => l)).toContain('Legenda');
    expect(new Set(BLOCK_STYLES.map((s) => s.format)).size).toBe(BLOCK_STYLES.length);
});
