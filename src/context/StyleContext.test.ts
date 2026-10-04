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
    // compara com a 1.ª passagem (não com o original): os patches de "estilos em falta" acrescentam regras
    const once = patchLoadedCss('@font-face { font-family: "Crimson Text"; src: url("/CrimsonText-Regular.ttf"); }');
    expect(once).toContain('url("/CrimsonText-Regular.ttf")');
    expect(patchLoadedCss(once)).toBe(once);
});
