import { test, expect } from 'bun:test';
import { ensureBaselineCss, stripEditorOnlyCss } from './baseline-css';
import { addCustomStyle } from './custom-styles';

const OLD = `body { margin: 5%; }\n    /* === ESTILOS DE PARÁGRAFO === */\n    .p-center { text-align: center; }\n`;

test('editor: acrescenta junto dos estilos de parágrafo só o que falta; não mexe em p-asterisk/hr', () => {
    const out = ensureBaselineCss(OLD, 'editor');
    expect(out.indexOf('.grid')).toBeGreaterThan(out.indexOf('/* === ESTILOS DE PARÁGRAFO === */'));
    expect(out.indexOf('.grid')).toBeLessThan(out.indexOf('.p-center'));
    for (const r of ['.p-italic', '.p-uppercase', 'img.img-inline', '.grid']) expect(out).toContain(r);
    for (const r of ['.p-asterisk', '.small-caps', 'divider-full']) expect(out).not.toContain(r);
});

test('export: acrescenta no fim, incluindo versaletes, p-asterisk e hr', () => {
    const out = ensureBaselineCss(OLD, 'export');
    for (const r of ['.small-caps', '.p-italic', '.p-uppercase', '.p-asterisk', 'img.img-inline', '.grid', 'hr.divider-full']) expect(out).toContain(r);
    expect(out.startsWith(OLD)).toBe(true);
});

test('idempotente e respeita regras já presentes', () => {
    for (const t of ['editor', 'export'] as const) {
        const once = ensureBaselineCss(OLD, t);
        expect(ensureBaselineCss(once, t)).toBe(once);
    }
    const has = `.p-italic { font-style: italic; }\n.grid { display: flex; }`;
    const out = ensureBaselineCss(has, 'export');
    expect(out.match(/\.grid/g)!.length).toBe(1);
    expect(out.match(/\.p-italic/g)!.length).toBe(1);
});

test('stripEditorOnlyCss: estilos personalizados depois do marcador do editor sobrevivem ao corte', () => {
    const css = addCustomStyle('p { margin: 0; }\n/* === EDITOR (não exportado para EPUB) === */\nhr.chapter-break { border: 0; }\n', 'p-a', 'text-align: right;');
    const out = stripEditorOnlyCss(css);
    expect(out).toContain('.p-a { text-align: right; }');
    expect(out).not.toContain('chapter-break');
});
