import { describe, expect, test } from 'bun:test';
import { reportToHtml } from './bookReportHtml';

const TEXT = ['RELATÓRIO DE FALHAS — Livro <A>', 'Total: 2 falhas', '', 'ESTILOS', '=======', 'Indentação (1)', '- [Cap 1 · PDF p. 3] "olá"', '    acrescentar .p-indent (porque)', '', 'LINKS', '=====', 'Sem falhas.'].join('\n');

describe('reportToHtml', () => {
    const html = reportToHtml(TEXT);
    test('estrutura', () => {
        expect(html).toContain('<h1>RELATÓRIO DE FALHAS — Livro &lt;A&gt;</h1>');
        expect(html).toContain('<h2>ESTILOS</h2>');
        expect(html).toContain('<h3>Indentação (1)</h3>');
        expect(html).toContain('<span class="tag">Cap 1 · PDF p. 3</span>');
        expect(html).toContain('<span class="sub">acrescentar .p-indent (porque)</span>');
        expect(html).toContain('<p>Sem falhas.</p>');
    });
    test('escapa HTML', () => expect(html).not.toContain('<A>'));
});
