import { test, expect } from 'bun:test';
import '../services/indesign/happy-dom'; // DOMParser no bun
import { parseStyle, sameStyle, convertSpanStyles, scanSpanStyles } from './inline-styles';

const BADGE = 'background: #000; color: #fff; padding: 0.15em 0.6em;';
const props = { background: '#000', color: '#fff', padding: '0.15em 0.6em' };
const parts = [
    `<h1>Capítulo <span style="${BADGE}">1</span></h1><p>texto <span style="${BADGE}">igual</span> e <span style="color: red;">outro</span></p>`,
    `<h1><span style="PADDING:0.15em   0.6em;Color:#FFF;background:#000">2</span></h1>`,
];

test('parseStyle/sameStyle: ordem, espaços e maiúsculas não contam; valor diferente conta', () => {
    expect(sameStyle(parseStyle(BADGE), parseStyle('padding:0.15em 0.6em;COLOR:#FFF;background:#000'))).toBe(true);
    expect(sameStyle(parseStyle(BADGE), parseStyle('background:#111; color:#fff; padding:0.15em 0.6em'))).toBe(false);
    expect(sameStyle(parseStyle(BADGE), parseStyle('background:#000; color:#fff'))).toBe(false); // propriedades a menos
});

test('converter nos h1: troca o style pela classe, só dentro do âmbito, qualquer ordem/maiúsculas', () => {
    const r = convertSpanStyles(parts, { style: props, cls: 'c-numero', scope: ['h1'] });
    expect(r.changed).toBe(2);
    expect(r.parts[0]).toContain('<h1>Capítulo <span class="c-numero">1</span></h1>');
    expect(r.parts[0]).toContain(`<span style="${BADGE}">igual</span>`); // o do <p> fica
    expect(r.parts[0]).toContain('<span style="color: red;">outro</span>');
    expect(r.parts[1]).toBe('<h1><span class="c-numero">2</span></h1>');
});

test('sem âmbito converte em todo o livro; a 2.ª corrida não muda nada e partes sem spans ficam iguais', () => {
    const all = convertSpanStyles(parts, { style: props, cls: 'c-numero' });
    expect(all.changed).toBe(3);
    expect(convertSpanStyles(all.parts, { style: props, cls: 'c-numero' }).changed).toBe(0);
    expect(convertSpanStyles(['<p>sem spans</p>'], { style: props, cls: 'c-x' }).parts[0]).toBe('<p>sem spans</p>');
});

test('mantém as outras classes e atributos do span', () => {
    const r = convertSpanStyles([`<h1><span class="x" data-a="1" style="${BADGE}">1</span></h1>`], { style: props, cls: 'c-numero' });
    expect(r.parts[0]).toContain('class="x c-numero"');
    expect(r.parts[0]).toContain('data-a="1"');
    expect(r.parts[0]).not.toContain('style=');
});

test('scanSpanStyles: agrupa por style normalizado, com contagem e onde aparece', () => {
    const found = scanSpanStyles(parts);
    expect(found[0]).toMatchObject({ count: 3, inBlocks: { h1: 2, p: 1 }, sample: '1' });
    expect(found[1]).toMatchObject({ style: 'color: red;', count: 1, inBlocks: { p: 1 } });
});
