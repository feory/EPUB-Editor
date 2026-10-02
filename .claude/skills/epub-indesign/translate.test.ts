// Casos reais encontrados ao converter os 15 EPUBs do InDesign (ver SKILL.md).
// Correr: bun test ./.claude/skills/epub-indesign/translate.test.ts  (com ./ — o bun ignora pastas com ponto num filtro)
import { test, expect } from 'bun:test';
import { intentOf, preservedOf, translateParagraph, translateSpan, type Props } from './translate';

// vocabulário do editor (na conversão vem do CSS do editor via editorVocabulary)
const vocabulary = new Set(['p-indent', 'p-top', 'p-space', 'p-bottom', 'p-center', 'p-small', 'p-legendas', 'p-quote',
    'p-bold', 'p-italic', 'p-bold-italic', 'p-uppercase', 'p-asterisk', 'alinea']);
const body = { where: 'body' as const, frontMatter: false, text: 'texto', vocabulary };
const para = (props: Props, targets: string[] = [], ctx: Partial<typeof body> = {}) =>
    translateParagraph(intentOf({ 'text-align': 'justify', ...props }, 1), { ...body, ...ctx, targets });

test('corpo com recuo de 1.ª linha → p-indent', () => {
    expect(para({ 'text-indent': '1.167em' })).toEqual({ tag: 'p', classes: ['p-indent'] });
});

test('Recolhidos (citação com recuo de 1.ª linha, forçado p-quote) → p-indent + p-quote', () => {
    const r = para({ 'margin-left': '2.333em', 'text-indent': '1.167em', 'font-size': '0.917em' }, ['p-quote']);
    expect(r).toEqual({ tag: 'p', classes: ['p-indent', 'p-quote'] });
});

test('LEGENDAS forçado p-legendas mantém o espaço acima (p-top) e o centrado', () => {
    const r = para({ 'text-align': 'center', 'margin-top': '1.25em', 'font-size': '0.833em' }, ['p-legendas']);
    expect(r).toEqual({ tag: 'p', classes: ['p-center', 'p-top', 'p-legendas'] });
});

test('bibliografia (recuo pendente curto) → parágrafo normal, só p-small', () => {
    expect(para({ 'text-indent': '-0.917em', 'margin-left': '0.917em', 'font-size': '0.833em' }))
        .toEqual({ tag: 'p', classes: ['p-small'] });
});

test('alíneas (recuo pendente longo) → alinea', () => {
    expect(para({ 'text-indent': '-0.917em', 'margin-left': '2.167em' })).toEqual({ tag: 'p', classes: ['alinea'] });
});

test('espaço acima: ≥ 0.5em p-top, ≥ 2.5em p-space; px convertidos pelo corpo', () => {
    expect(para({ 'margin-top': '1.25em' })).toEqual({ tag: 'p', classes: ['p-top'] });
    expect(para({ 'margin-top': '100px' })).toEqual({ tag: 'p', classes: ['p-space'] });
    expect(para({ 'margin-top': '0.3em' })).toEqual({ tag: 'p', classes: [] });
});

test('alinhado à direita/esquerda → style inline (como os botões do editor)', () => {
    expect(para({ 'text-align': 'right' })).toEqual({ tag: 'p', classes: [], align: 'right' });
    expect(para({ 'text-align': 'start' })).toEqual({ tag: 'p', classes: [], align: 'left' });
});

test('"*" num estilo de título → separador p-asterisk, não capítulo', () => {
    expect(para({ 'text-align': 'center' }, ['h1'], { text: ' *** ' })).toEqual({ tag: 'p', classes: ['p-asterisk'] });
});

test('títulos só levam o alinhamento (centrado/direita; esquerda é o padrão)', () => {
    const big = { 'font-size': '3em', 'font-weight': 'bold', 'margin-top': '100px' };
    expect(para({ ...big, 'text-align': 'center' }, ['h1'])).toEqual({ tag: 'h1', classes: ['p-center'] });
    expect(para({ ...big, 'text-align': 'left' }, ['h3'])).toEqual({ tag: 'h3', classes: [] });
    expect(para({ ...big, 'text-align': 'right' }, ['h3'])).toEqual({ tag: 'h3', classes: [], align: 'right' });
});

test('antes do Índice não há capítulos: título vira parágrafo com as classes automáticas', () => {
    expect(para({ 'text-align': 'center', 'font-weight': 'bold' }, ['h1'], { frontMatter: true }))
        .toEqual({ tag: 'p', classes: ['p-center', 'p-bold'] });
});

test('notas e tabelas: sem classes nem alinhamento', () => {
    expect(para({ 'text-align': 'center', 'font-size': '0.75em' }, [], { where: 'note' })).toEqual({ tag: 'p', classes: [] });
    expect(para({ 'text-align': 'right' }, [], { where: 'table' })).toEqual({ tag: 'p', classes: [] });
});

test('__remove__ apaga', () => {
    expect(para({}, ['__remove__'])).toEqual({ remove: true });
    expect(translateSpan({}, ['__remove__'])).toEqual({ remove: true });
});

test('span: semântica só com efeito real no CSS', () => {
    expect(translateSpan({ 'font-style': 'italic' }, ['i'])).toEqual({ wraps: ['i'], classes: [] });
    expect(translateSpan({ 'font-weight': 'bold', 'font-style': 'italic' }, ['b i'])).toEqual({ wraps: ['b', 'i'], classes: [] });
    // estilo "Superscript" sem elevação no CSS não é <sup>
    expect(translateSpan({ 'font-size': '58%' }, ['sup'])).toEqual({ wraps: [], classes: [] });
    // "Gotham-Rounded-Medium" com peso 300 mapeado b por engano → sem <b>
    expect(translateSpan({ 'font-weight': '300' }, ['b'])).toEqual({ wraps: [], classes: [] });
    expect(translateSpan({ 'font-variant': 'small-caps' }, ['small-caps'])).toEqual({ wraps: [], classes: ['small-caps'] });
});

test('preservedOf: o que o verify compara', () => {
    const i = intentOf({ 'text-align': 'center', 'text-indent': '1em', 'margin-top': '1em', 'font-weight': 'bold' }, 1);
    expect(preservedOf(i)).toEqual({ align: 'center', indent: false, above: true, below: false, bold: true, italic: false, upper: false });
});
