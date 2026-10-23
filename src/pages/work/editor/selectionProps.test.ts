import { test, expect } from 'bun:test';
import { toHex, readSelectionProps, selectionPatchOps, selectionToCss, cssToSelection, EMPTY_SELECTION } from './selectionProps';

test('toHex: rgb()/hex normalizam; nomes e vazio dão ""', () => {
    expect(toHex('rgb(255, 224, 102)')).toBe('#ffe066');
    expect(toHex('#FFE066')).toBe('#ffe066');
    expect(toHex('transparent')).toBe('');
    expect(toHex('')).toBe('');
});

test('readSelectionProps: lê cada propriedade; família só se for genérica conhecida', () => {
    const css: Record<string, string> = { color: 'rgb(0, 0, 255)', 'background-color': '#ffe066', 'font-size': '1.2em', 'letter-spacing': '0.05em', 'font-family': 'Serif' };
    expect(readSelectionProps((n) => css[n] ?? '')).toEqual({
        color: '#0000ff', background: '#ffe066', fontSize: { n: 1.2, u: 'em' }, letterSpacing: { n: 0.05, u: 'em' }, fontFamily: 'serif',
    });
    expect(readSelectionProps(() => '')).toEqual(EMPTY_SELECTION);
    expect(readSelectionProps((n) => (n === 'font-family' ? '"Lora", serif' : '')).fontFamily).toBe('');
});

test('selectionPatchOps: só o que está no patch, por ordem dos campos; vazio/null remove', () => {
    expect(selectionPatchOps({ background: '#ffe066', fontSize: { n: 1.2, u: 'em' }, color: '', letterSpacing: null })).toEqual([
        { format: 'forecolor', css: 'color', value: null },
        { format: 'hilitecolor', css: 'background-color', value: '#ffe066' },
        { format: 'fontsize', css: 'font-size', value: '1.2em' },
        { format: 'letterspacing', css: 'letter-spacing', value: null },
    ]);
});

test('selectionToCss: formatos e aspeto viram declarações; vazio dá ""', () => {
    expect(selectionToCss({ ...EMPTY_SELECTION, formats: [] })).toBe('');
    expect(selectionToCss({ ...EMPTY_SELECTION, formats: ['bold', 'small-caps'], background: '#ffe066', letterSpacing: { n: 0.05, u: 'em' } }))
        .toBe('font-weight: bold; font-variant: small-caps; background-color: #ffe066; letter-spacing: 0.05em;');
});

test('cssToSelection: o inverso de selectionToCss (formatos, aspeto, sublinhado+rasurado juntos)', () => {
    const sel = { ...EMPTY_SELECTION, formats: ['bold', 'underline', 'strikethrough', 'small-caps', 'uppercase'], color: '#c00000', background: '#ffe066', fontSize: { n: 1.2, u: 'em' as const }, letterSpacing: { n: 0.05, u: 'em' as const }, fontFamily: 'serif' };
    const css = selectionToCss(sel);
    expect(css).toContain('text-decoration: underline line-through;');
    const back = cssToSelection(css);
    expect(back.selection).toEqual(sel);
    expect(back.rest).toEqual([]);
});

test('cssToSelection: sobrescrito/subscrito não viram "texto pequeno"; font-size smaller sozinho sim', () => {
    expect(cssToSelection('vertical-align: super; font-size: smaller;').selection.formats).toEqual(['superscript']);
    expect(cssToSelection('font-size: smaller;').selection.formats).toEqual(['small-text']);
    expect(cssToSelection(selectionToCss({ ...EMPTY_SELECTION, formats: ['subscript'] })).selection.formats).toEqual(['subscript']);
});

test('cssToSelection: o que os controlos não representam volta em rest e é preservado', () => {
    const { selection, rest } = cssToSelection('color: red; font-size: 80%; margin-left: 2em; font-weight: 300; font-style: italic;');
    expect(selection.formats).toEqual(['italic']);
    expect(selection.color).toBe('');
    expect(rest).toEqual(['color: red', 'font-size: 80%', 'margin-left: 2em', 'font-weight: 300']);
});
