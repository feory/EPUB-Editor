import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { applyTextProps, textPropsFrom, textPatchToDecls, EMPTY_TEXT, type TextDom } from './textProps';
import { readRule, applyRule } from './cssRule';

const CSS = `
    /* === PARÁGRAFOS === */
    p { margin-top: 0; text-align: justify; line-height: 2.0em; }
    p.drop-cap { text-indent: 0 !important; }
    .p-quote      { margin-left: 4.5em !important; font-size: 0.85em !important; }
`;

test('readRule lê a regra certa (não p.drop-cap) e textPropsFrom converte em→número', () => {
    const p = textPropsFrom(readRule(CSS, 'p'));
    expect(p).toMatchObject({ align: 'justify', lineHeight: 2, marginTop: 0, indent: null });
    expect(textPropsFrom(readRule(CSS, '.p-quote'))).toMatchObject({ marginLeft: 4.5, fontSize: 0.85 });
});

test('applyRule edita, mantém !important, remove com null e cria regra em falta', () => {
    const out = applyRule(CSS, '.p-quote', textPatchToDecls({ marginLeft: 6, fontSize: null, align: 'center' }));
    expect(out).toContain('.p-quote { margin-left: 6em !important; text-align: center; }');
    expect(out).toContain('p.drop-cap { text-indent: 0 !important; }'); // intacta
    expect(out).toContain('/* === PARÁGRAFOS === */');
    expect(applyRule(CSS, 'h2', textPatchToDecls({ color: '#444' }))).toContain('h2 { color: #444; }');
});

test('applyTextProps escreve inline e Repor (EMPTY_TEXT) limpa', () => {
    const el = new Window().document.createElement('p') as unknown as HTMLElement;
    const dom: TextDom = { setStyle: (e, n, v) => { if (v) e.style.setProperty(n, v); else e.style.removeProperty(n); } };
    applyTextProps(dom, el, { align: 'center', indent: 2, color: '#112233' });
    expect(textPropsFrom((n) => el.style.getPropertyValue(n))).toMatchObject({ align: 'center', indent: 2, color: '#112233' });
    applyTextProps(dom, el, EMPTY_TEXT);
    expect(el.getAttribute('style') ?? '').toBe('');
});
