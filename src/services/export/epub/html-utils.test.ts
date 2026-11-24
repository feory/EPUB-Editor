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
    expect(cleanHtmlForXhtml('<div class="box box--nota"><p>n</p></div>')).toContain('epub:type="notice" role="doc-notice"'); // ACE: epub-type-has-matching-role
});

test('linkUrls: URL solto vira link sem a pontuação final; não toca em URLs já ligados', () => {
    expect(linkUrls('<p>Ver https://doi.org/10.1/x.</p>')).toBe('<p>Ver <a href="https://doi.org/10.1/x">https://doi.org/10.1/x</a>.</p>');
    expect(linkUrls('<p>(http://a.pt/b_(c))</p>')).toBe('<p>(<a href="http://a.pt/b_(c)">http://a.pt/b_(c)</a>)</p>');
    expect(linkUrls('<p><a href="http://a.pt">http://a.pt</a></p>')).toBe('<p><a href="http://a.pt">http://a.pt</a></p>');
});

test('linkUrls: endereços com www. (sem http) também ficam clicáveis, com href https://', () => {
    expect(linkUrls('<p>Ver www.exemplo.pt/pagina, e depois www.un.org.</p>')).toBe('<p>Ver <a href="https://www.exemplo.pt/pagina">www.exemplo.pt/pagina</a>, e depois <a href="https://www.un.org">www.un.org</a>.</p>');
    expect(linkUrls('<p>(www.bbc.com/future/article-1)</p>')).toBe('<p>(<a href="https://www.bbc.com/future/article-1">www.bbc.com/future/article-1</a>)</p>');
    expect(linkUrls('<p>http://a.pt e www.b.pt</p>')).toBe('<p><a href="http://a.pt">http://a.pt</a> e <a href="https://www.b.pt">www.b.pt</a></p>');
    // não conta: já dentro de <a>, no meio de uma palavra, num email, dentro de outro endereço, ou sem domínio
    expect(linkUrls('<p><a href="https://www.a.pt">www.a.pt</a></p>')).toBe('<p><a href="https://www.a.pt">www.a.pt</a></p>');
    expect(linkUrls('<p>awww.a.pt</p>')).toBe('<p>awww.a.pt</p>');
    expect(linkUrls('<p>rui@www.a.pt</p>')).toBe('<p>rui@www.a.pt</p>');
    expect(linkUrls('<p>https://x.pt/www.a.pt</p>')).toBe('<p><a href="https://x.pt/www.a.pt">https://x.pt/www.a.pt</a></p>');
    expect(linkUrls('<p>www. e www.pt</p>')).toBe('<p>www. e www.pt</p>');
});
