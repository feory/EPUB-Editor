import { test, expect } from 'bun:test';
import { patchLoadedCss } from './StyleContext';

test('patchLoadedCss: caminho relativo antigo da fonte Crimson Text vira absoluto', () => {
    const css = `@font-face { font-family: "Crimson Text"; src: url("Fonts/CrimsonText-Regular.ttf"); }
@font-face { font-family: "Crimson Text"; src: url("Fonts/CrimsonText-BoldItalic.ttf"); }`;
    const patched = patchLoadedCss(css);
    expect(patched).toContain('url("/CrimsonText-Regular.ttf")');
    expect(patched).toContain('url("/CrimsonText-BoldItalic.ttf")');
    expect(patched).not.toContain('Fonts/');
});

test('patchLoadedCss: caminho já absoluto fica inalterado (idempotente)', () => {
    // .p-italic presente só para isolar do patch de "estilos de parágrafo em falta" (não é o alvo deste teste)
    const css = '.p-italic {} @font-face { font-family: "Crimson Text"; src: url("/CrimsonText-Regular.ttf"); }';
    expect(patchLoadedCss(css)).toBe(css);
});
