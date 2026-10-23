import { test, expect } from 'bun:test';

import { cleanText, collapseHyphenBreaks, stripRedundantEmphasis, type RenderContext } from './story';

test('cleanText: tira hifen mole (U+00AD) e normaliza separadores de linha/tab', () => {
    expect(cleanText('Romano­-Germanico')).toBe('Romano-Germanico');
    expect(cleanText('a b c\td')).toBe('a b c d');
});

test('collapseHyphenBreaks: palavra composta partida na quebra de linha do InDesign vira um so hifen', () => {
    // "Romano<hifen mole>-<quebra de linha>-Germanico" - ja sem hifen mole e ja com a quebra
    // de linha convertida em espaco (ambos feitos por cleanText, antes disto).
    expect(collapseHyphenBreaks('Sacro Imperio Romano- -Germanico')).toBe('Sacro Imperio Romano-Germanico');
});

test('collapseHyphenBreaks: palavra partida entre dois CharacterStyleRange (concatenacao de runs)', () => {
    // "Saint-<quebra>-" (1o run) + "Aubin-du-Cormier" (2o run, formatacao diferente) - sem tag
    // entre os dois, mesma limitacao real do livro "Escritos Politicos".
    expect(collapseHyphenBreaks('jornada de Saint- -Aubin-du-Cormier (27 de julho')).toBe('jornada de Saint-Aubin-du-Cormier (27 de julho');
});

test('collapseHyphenBreaks: nao mexe num hifen a separar duas palavras distintas', () => {
    expect(collapseHyphenBreaks('cafe - cha')).toBe('cafe - cha');
    expect(collapseHyphenBreaks('um hifen - so')).toBe('um hifen - so');
});

test('stripRedundantEmphasis: p-bold/p-italic tiram strong/b e em/i; sem a classe não mexe', () => {
    expect(stripRedundantEmphasis('<strong>a</strong> <em>b</em>', ['p-bold'])).toBe('a <em>b</em>');
    expect(stripRedundantEmphasis('<b class="x">a</b> <i>b</i>', ['p-italic p-top'])).toBe('<b class="x">a</b> b');
    expect(stripRedundantEmphasis('<strong>a</strong><em>b</em><br>', ['p-bold-italic'])).toBe('ab<br>');
    expect(stripRedundantEmphasis('<strong>a</strong>', ['p-indent'])).toBe('<strong>a</strong>');
});

test('renderPsr: numeral de capítulo a branco ganha caixa preta (o Rectangle preto não vem na story)', async () => {
    await import('../../indesign/happy-dom');
    const { renderPsr } = await import('./story');
    const xml = `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/texto"><CharacterStyleRange FillColor="Color/Paper"><Content>V</Content><Br/></CharacterStyleRange></ParagraphStyleRange>`;
    const psr = new DOMParser().parseFromString(xml, 'application/xml').documentElement;
    const rc = { styles: { colors: new Map([['Color/Paper', { space: 'CMYK', values: [0, 0, 0, 0] }]]), paraIndents: new Map(), charStyles: new Map() } } as unknown as RenderContext;
    const [seg] = renderPsr(rc, psr, { n: 0, star: 0, defs: [] });
    expect(seg.text).toContain('background:#000');
    expect(seg.text).toContain('>V</span>');
    expect(seg.boxedNumeral).toBe('V');
});

test('renderStory: numeral (estilo a branco) junta-se ao título seguinte num só <h1>', async () => {
    await import('../../indesign/happy-dom');
    const { renderStory } = await import('./story');
    const xml = `<idPkg:Story xmlns:idPkg="x"><Story>
<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/numeros"><CharacterStyleRange><Content>IV</Content><Br/></CharacterStyleRange></ParagraphStyleRange>
<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/texto" Justification="CenterAlign"><CharacterStyleRange FontStyle="Bold" PointSize="15"><Content>AGORA ANTES.</Content><Br/></CharacterStyleRange></ParagraphStyleRange>
</Story></idPkg:Story>`;
    const paraIndents = new Map([['ParagraphStyle/numeros', { left: 0, first: 0, spaceBefore: 0, spaceAfter: 0, fill: 'Color/Paper' }]]);
    const rc = { styles: { colors: new Map([['Color/Paper', { space: 'CMYK', values: [0, 0, 0, 0] }]]), paraIndents, charStyles: new Map() } } as unknown as RenderContext;
    const html = renderStory(rc, xml, { n: 0, star: 0, defs: [] }, {});
    expect(html).toMatch(/^<h1 class="p-center">.*background:#000.*>IV<\/span><br>.*AGORA ANTES\..*<\/h1>$/);
});
