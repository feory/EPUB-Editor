import './../../indesign/happy-dom';
import { test, expect } from 'bun:test';
import { renderStory } from './story';
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
