import { test, expect } from 'bun:test';
import { cleanHtmlForXhtml } from './html-utils';

test('cleanHtmlForXhtml auto-fecha <col> sem tocar em <colgroup>', () => {
    const out = cleanHtmlForXhtml('<table><colgroup><col><col span="2"></colgroup><tr><td>a</td></tr></table>');
    expect(out).toContain('<colgroup><col /><col span="2" /></colgroup>');
});
