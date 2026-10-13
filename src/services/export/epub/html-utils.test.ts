import { test, expect } from 'bun:test';
import { cleanHtmlForXhtml, linkUrls } from './html-utils';

test('cleanHtmlForXhtml auto-fecha <col> sem tocar em <colgroup>', () => {
    const out = cleanHtmlForXhtml('<table><colgroup><col><col span="2"></colgroup><tr><td>a</td></tr></table>');
    expect(out).toContain('<colgroup><col /><col span="2" /></colgroup>');
});

test('cleanHtmlForXhtml auto-fecha os restantes elementos vazios (source, track…), sem tocar em <basefont>', () => {
    expect(cleanHtmlForXhtml('<video><source src="a.mp4"><track src="a.vtt"></video>')).toContain('<source src="a.mp4" /><track src="a.vtt" />');
});

test('cleanHtmlForXhtml dá epub:type + role às variantes de caixa e ignora .box simples', () => {
    const out = cleanHtmlForXhtml('<div class="box box--aviso"><p>a</p></div><div class="box"><p>b</p></div>');
    expect(out).toContain('<div class="box box--aviso" epub:type="warning" role="note"><p>a</p></div>');
    expect(out).toContain('<div class="box"><p>b</p></div>');
});

test('linkUrls: URL solto vira link sem a pontuação final; não toca em URLs já ligados', () => {
    expect(linkUrls('<p>Ver https://doi.org/10.1/x.</p>')).toBe('<p>Ver <a href="https://doi.org/10.1/x">https://doi.org/10.1/x</a>.</p>');
    expect(linkUrls('<p>(http://a.pt/b_(c))</p>')).toBe('<p>(<a href="http://a.pt/b_(c)">http://a.pt/b_(c)</a>)</p>');
    expect(linkUrls('<p><a href="http://a.pt">http://a.pt</a></p>')).toBe('<p><a href="http://a.pt">http://a.pt</a></p>');
});
