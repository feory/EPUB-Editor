import './../../indesign/happy-dom';
import { test, expect } from 'bun:test';
import { renderStory, adoptTableNoteRefs } from './story';
import { NO_STYLES } from './styles';

const cell = (name: string, extra: string, text: string, just = '') =>
    `<Cell Name="${name}" RowSpan="1" ColumnSpan="1" ${extra}><ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/TXT"${just}><CharacterStyleRange><Content>${text}</Content></CharacterStyleRange></ParagraphStyleRange></Cell>`;

test('tabela IDML: RowSpan/ColumnSpan viram rowspan/colspan; centrado só quando todos os parágrafos o são', () => {
    const xml = `<idPkg:Story xmlns:idPkg="x"><Story><ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/TXT"><CharacterStyleRange><Table HeaderRowCount="0">
        ${cell('0:0', 'VerticalJustification="CenterAlign"', 'Plano', ' Justification="CenterAlign"').replace('RowSpan="1"', 'RowSpan="2"')}
        ${cell('1:0', '', 'A')}${cell('1:1', '', 'B')}
    </Table></CharacterStyleRange></ParagraphStyleRange></Story></idPkg:Story>`;
    const html = renderStory({ styles: NO_STYLES, detectSpacing: false }, xml, { n: 0, star: 0, defs: [] }, {});
    expect(html).toContain('<td rowspan="2" style="text-align:center;vertical-align:middle">Plano</td>');
    expect(html).toContain('Plano</td><td>A</td></tr><tr><td>B</td></tr>');
});

test('tabela IDML só com um gráfico (figura numa célula): não gera <table> vazia', () => {
    const xml = `<idPkg:Story xmlns:idPkg="x"><Story><ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/TXT"><CharacterStyleRange><Table HeaderRowCount="0">
        <Cell Name="0:0" RowSpan="1" ColumnSpan="1"><ParagraphStyleRange><CharacterStyleRange><Rectangle ContentType="GraphicType" /></CharacterStyleRange></ParagraphStyleRange></Cell>
    </Table></CharacterStyleRange></ParagraphStyleRange></Story></idPkg:Story>`;
    expect(renderStory({ styles: NO_STYLES, detectSpacing: false }, xml, { n: 0, star: 0, defs: [] }, {})).not.toContain('<table');
});

const ref = (n: number) => `<sup><a href="#footnote-${n}" class="footnote-ref">${n}</a></sup>`;

test('adoptTableNoteRefs: sobrescritos da tabela (a negrito) viram referências e o parágrafo solto sai', () => {
    const html = `<p>x</p>\n<table><tr><td><strong>DORA</strong><sup><strong>27</strong></sup> e <sup><em>28</em></sup><sup>9</sup></td></tr></table>\n<p class="p-top">${ref(27)} ${ref(28)}</p>\n<p class="footnote" id="footnote-27">(<sup>27</sup>) nota</p>`;
    expect(adoptTableNoteRefs(html)).toBe(`<p>x</p>\n<table><tr><td><strong>DORA</strong>${ref(27)} e ${ref(28)}<sup>9</sup></td></tr></table>\n<p class="footnote" id="footnote-27">(<sup>27</sup>) nota</p>`);
});

test('adoptTableNoteRefs: números que não estão na tabela → não mexe', () => {
    const html = `<table><tr><td><sup>1</sup></td></tr></table>\n<p>${ref(1)} ${ref(2)}</p>`;
    expect(adoptTableNoteRefs(html)).toBe(html);
});
