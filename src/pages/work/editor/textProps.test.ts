import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { applyTextProps, textPropsFrom, textPatchToDecls, EMPTY_TEXT, convertLen, type TextDom } from './textProps';
import { readRule, applyRule } from './cssRule';

const CSS = `
    /* === PARÁGRAFOS === */
    p { margin-top: 0; text-align: justify; line-height: 2.0em; }
    p.drop-cap { text-indent: 0 !important; }
    .p-quote      { margin-left: 4.5em !important; font-size: 0.85em !important; }
`;

test('readRule lê a regra certa (não p.drop-cap) e textPropsFrom converte em→número', () => {
    const p = textPropsFrom(readRule(CSS, 'p'));
    expect(p).toMatchObject({ align: 'justify', lineHeight: { n: 2, u: 'em' }, marginTop: { n: 0, u: 'em' }, indent: null });
    expect(textPropsFrom(readRule(CSS, '.p-quote'))).toMatchObject({ marginLeft: { n: 4.5, u: 'em' }, fontSize: { n: 0.85, u: 'em' } });
});

test('applyRule edita, mantém !important, remove com null e cria regra em falta', () => {
    const out = applyRule(CSS, '.p-quote', textPatchToDecls({ marginLeft: { n: 6, u: 'em' }, fontSize: null, align: 'center' }));
    expect(out).toContain('.p-quote { margin-left: 6em !important; text-align: center; }');
    expect(out).toContain('p.drop-cap { text-indent: 0 !important; }'); // intacta
    expect(out).toContain('/* === PARÁGRAFOS === */');
    expect(applyRule(CSS, 'h2', textPatchToDecls({ color: '#444' }))).toContain('h2 { color: #444; }');
});

test('applyTextProps escreve inline e Repor (EMPTY_TEXT) limpa', () => {
    const el = new Window().document.createElement('p') as unknown as HTMLElement;
    const dom: TextDom = { setStyle: (e, n, v) => { if (v) e.style.setProperty(n, v); else e.style.removeProperty(n); } };
    applyTextProps(dom, el, { align: 'center', indent: { n: 2, u: 'px' }, color: '#112233' });
    expect(textPropsFrom((n) => el.style.getPropertyValue(n))).toMatchObject({ align: 'center', indent: { n: 2, u: 'px' }, color: '#112233' });
    applyTextProps(dom, el, EMPTY_TEXT);
    expect(el.getAttribute('style') ?? '').toBe('');
});

test('textPropsFrom: mantém a unidade do CSS (px/em); % fica vazio; convertLen 16px = 1em', () => {
    const get = (n: string) => ({ 'margin-top': '30px !important', 'font-size': '120%', 'margin-bottom': '0', 'margin-left': '2rem' })[n] ?? '';
    expect(textPropsFrom(get)).toMatchObject({ marginTop: { n: 30, u: 'px' }, fontSize: null, marginBottom: { n: 0, u: 'em' }, marginLeft: { n: 2, u: 'em' } });
    expect(convertLen({ n: 30, u: 'px' }, 'em')).toEqual({ n: 1.88, u: 'em' });
    expect(convertLen({ n: 1.5, u: 'em' }, 'px')).toEqual({ n: 24, u: 'px' });
});
