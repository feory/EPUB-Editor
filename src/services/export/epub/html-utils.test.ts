import { test, expect } from 'bun:test';
import { cleanHtmlForXhtml } from './html-utils';

test('cleanHtmlForXhtml auto-fecha <col> sem tocar em <colgroup>', () => {
    const out = cleanHtmlForXhtml('<table><colgroup><col><col span="2"></colgroup><tr><td>a</td></tr></table>');
    expect(out).toContain('<colgroup><col /><col span="2" /></colgroup>');
});

test('cleanHtmlForXhtml auto-fecha os restantes elementos vazios (source, track…), sem tocar em <basefont>', () => {
    expect(cleanHtmlForXhtml('<video><source src="a.mp4"><track src="a.vtt"></video>')).toContain('<source src="a.mp4" /><track src="a.vtt" />');
});
