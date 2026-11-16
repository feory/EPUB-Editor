import './../../indesign/happy-dom';
import { test, expect } from 'bun:test';
import { renderStory } from './story';
import { NO_STYLES, type IdmlStyles } from './styles';

const psr = (style: string, text: string, attrs = '') => `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${style}"${attrs}><CharacterStyleRange><Content>${text}</Content></CharacterStyleRange></ParagraphStyleRange>`;
const story = (...p: string[]) => `<idPkg:Story xmlns:idPkg="x"><Story>${p.join('')}</Story></idPkg:Story>`;
const render = (xml: string, styles: IdmlStyles = NO_STYLES) => renderStory({ styles, detectSpacing: false }, xml, { n: 0, star: 0, defs: [] }, {});
const withShading = (name: string, tint: string): IdmlStyles => ({
    ...NO_STYLES,
    paraIndents: new Map([[`ParagraphStyle/${name}`, { left: 17, first: 0, spaceBefore: 0, spaceAfter: 0, shading: { on: true, tint } }]]),
});
const BOX = '<div class="box" style="background-color:rgb(230,230,230);border-width:0">';

test('sombreado de parágrafo do ESTILO (tom 10 %, preto por omissão): parágrafos seguidos formam UMA caixa cinzenta sem contorno', () => {
    const html = render(story(psr('TXT', 'antes'), psr('DEST', 'um'), psr('DEST', 'dois'), psr('TXT', 'depois')), withShading('DEST', '10'));
    expect(html).toBe(`<p>antes</p>\n${BOX}\n<p>um</p>\n<p>dois</p>\n</div>\n<p>depois</p>`);
});

test('sombreado LOCAL no parágrafo (sem estilo sombreado); o recuo do IDML não se repete dentro da caixa', () => {
    const html = render(story(psr('TXT', 'caixa', ' ParagraphShadingOn="true" ParagraphShadingTint="10" LeftIndent="17"'), psr('TXT', 'fora')));
    expect(html).toBe(`${BOX}\n<p>caixa</p>\n</div>\n<p>fora</p>`);
});

test('override local desliga o sombreado do estilo; sem sombreado não há caixa', () => {
    const html = render(story(psr('DEST', 'sem', ' ParagraphShadingOn="false"')), withShading('DEST', '10'));
    expect(html).toBe('<p style="margin-left:1.42em">sem</p>'); // sem caixa, o recuo do estilo aplica-se
    expect(render(story(psr('TXT', 'a')))).toBe('<p>a</p>');
});

test('caixa que fecha no fim da story', () => {
    expect(render(story(psr('DEST', 'só')), withShading('DEST', '10'))).toBe(`${BOX}\n<p>só</p>\n</div>`);
});

const empty = (style: string) => `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${style}"><CharacterStyleRange><Content></Content></CharacterStyleRange></ParagraphStyleRange>`;

test('um parágrafo vazio (sem sombreado) entre dois sombreados não parte a caixa: não gerou bloco', () => {
    const html = render(story(psr('DEST', 'um'), empty('TXT'), psr('DEST', 'dois')), withShading('DEST', '10'));
    expect(html).toBe(`${BOX}\n<p>um</p>\n<p>dois</p>\n</div>`);
});

test('títulos seguidos do mesmo estilo fundem-se, mas não de dentro para fora da caixa', () => {
    const mapping = { TIT: { target: 'h2' } } as never;
    const styles = withShading('TIT_BOX', '10');
    const fused = renderStory({ styles: NO_STYLES, detectSpacing: false }, story(psr('TIT', 'A'), psr('TIT', 'B')), { n: 0, star: 0, defs: [] }, mapping);
    expect(fused).toBe('<h2>A<br>B</h2>');
    // 2.º título sombreado (mesmo estilo, sombreado local): outro bloco, dentro da caixa
    const split = renderStory({ styles, detectSpacing: false }, story(psr('TIT', 'A'), psr('TIT', 'B', ' ParagraphShadingOn="true" ParagraphShadingTint="10"')), { n: 0, star: 0, defs: [] }, mapping);
    expect(split).toBe(`<h2>A</h2>\n${BOX}\n<h2>B</h2>\n</div>`);
});
