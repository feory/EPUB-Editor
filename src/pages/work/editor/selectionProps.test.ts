import { test, expect } from 'bun:test';
import { toHex, readSelectionProps, selectionPatchOps, selectionToCss, cssToSelection, charFormats, EMPTY_SELECTION } from './selectionProps';

test('toHex: rgb()/hex normalizam; nomes e vazio dão ""', () => {
    expect(toHex('rgb(255, 224, 102)')).toBe('#ffe066');
    expect(toHex('#FFE066')).toBe('#ffe066');
    expect(toHex('transparent')).toBe('');
    expect(toHex('')).toBe('');
});

test('readSelectionProps: lê cada propriedade; família só se for genérica conhecida', () => {
    const css: Record<string, string> = { color: 'rgb(0, 0, 255)', 'background-color': '#ffe066', 'font-size': '1.2em', 'letter-spacing': '0.05em', 'font-family': 'Serif' };
    expect(readSelectionProps((n) => css[n] ?? '')).toEqual({
        ...EMPTY_SELECTION, color: '#0000ff', background: '#ffe066', fontSize: { n: 1.2, u: 'em' }, letterSpacing: { n: 0.05, u: 'em' }, fontFamily: 'serif',
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
    const { selection, rest } = cssToSelection('color: red; font-size: 80%; margin: 1em 2em; font-weight: 350; font-style: italic;');
    expect(selection.formats).toEqual(['italic']);
    expect(selection.color).toBe('');
    expect(rest).toEqual(['color: red', 'font-size: 80%', 'margin: 1em 2em', 'font-weight: 350']);
});

test('personalização extra: ida e volta pelo CSS (caixa, sublinhado, maiúsculas, peso)', () => {
    const sel = { ...EMPTY_SELECTION, formats: [], borderColor: '#ff0000', borderWidth: { n: 2, u: 'px' as const }, radius: { n: 0.3, u: 'em' as const },
        padTop: { n: 0.2, u: 'em' as const }, padLeft: { n: 0.5, u: 'em' as const }, marginTop: { n: 0.5, u: 'em' as const }, marginBottom: { n: 0.75, u: 'em' as const }, marginLeft: { n: 1, u: 'em' as const }, marginRight: { n: 0.25, u: 'em' as const }, underlineStyle: 'wavy', underlineColor: '#00ff00', underlineThickness: { n: 2, u: 'px' as const }, transform: 'capitalize', weight: '300' };
    const css = selectionToCss(sel);
    expect(css).toContain('border-style: solid');
    expect(css).toContain('text-decoration: underline'); // sublinhado personalizado liga o sublinhado
    const back = cssToSelection(css);
    expect(back.rest).toEqual([]);
    expect(back.selection).toEqual({ ...sel, formats: ['underline'] });
});

test('charFormats: um formato por propriedade não nativa, com o que a tabela arrasta', () => {
    const byName = Object.fromEntries(charFormats().map((f) => [f.name, f.styles]));
    expect(byName.letterspacing).toEqual({ letterSpacing: '%value' });
    expect(byName.forecolor).toBeUndefined(); // nativos não se registam
    expect(byName.bordercolor).toEqual({ borderColor: '%value' });
    expect(byName.borderwidth).toEqual({ borderWidth: '%value', borderStyle: 'solid', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' });
    expect(byName.charpadleft).toEqual({ paddingLeft: '%value', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone' });
    expect(byName.charmargintop).toEqual({ marginTop: '%value' });
    expect(byName.underlinestyle).toEqual({ textDecorationStyle: '%value', textDecorationLine: 'underline' });
    // todo o nome de formato do patch tem formato registado ou é nativo
    const ops = selectionPatchOps({ ...EMPTY_SELECTION, borderColor: '#000000' }).map((o) => o.format);
    expect(ops.every((f) => byName[f] || ['forecolor', 'hilitecolor', 'fontsize', 'fontname'].includes(f))).toBe(true);
});
