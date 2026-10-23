import { test, expect } from 'bun:test';
import { toHex, readSelectionProps, selectionPatchOps, EMPTY_SELECTION } from './selectionProps';

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
