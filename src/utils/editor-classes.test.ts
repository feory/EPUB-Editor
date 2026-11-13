import { test, expect } from 'bun:test';
import { EDITOR_CLASSES, STRUCTURAL_CLASSES, HEADING_STRIPPED_CLASSES, INDENT_CONTROLLED_CLASSES, SPECIAL_INDENT_CLASSES, ALINEA_PROTECTED_CLASSES, TITLE_LIKE_CLASSES, exclusiveOf } from './editor-classes';
import { BLOCK_CLASS_STYLES } from '../pages/work/editor/blockStyles';

const sorted = (a: string[]) => [...a].sort();

// As listas que cada módulo tinha escrita à mão, fixadas: a tabela tem de dar o mesmo (mais p-asterisk, que não constava de nenhuma).
test('as consultas dão o que as listas antigas davam (+ p-asterisk)', () => {
    expect(sorted(HEADING_STRIPPED_CLASSES)).toEqual(sorted(['p-indent', 'p-top', 'p-small', 'p-bold', 'p-italic', 'p-bold-italic', 'p-uppercase', 'p-quote', 'p-legendas', 'p-non-indent', 'footnote', 'drop-cap', 'alinea', 'p-border-top', 'p-border-bottom', 'p-border-sides', 'p-asterisk']));
    expect(sorted(INDENT_CONTROLLED_CLASSES)).toEqual(sorted(['footnote', 'alinea', 'drop-cap', 'p-non-indent', 'p-indent', 'p-center', 'p-bold', 'p-bold-italic', 'p-border-top', 'p-border-bottom', 'p-border-sides', 'p-asterisk']));
    expect(sorted(SPECIAL_INDENT_CLASSES)).toEqual(sorted(['footnote', 'alinea', 'drop-cap', 'p-center', 'p-border-top', 'p-border-bottom', 'p-border-sides', 'p-asterisk']));
    expect(sorted(ALINEA_PROTECTED_CLASSES)).toEqual(sorted(['p-indent', 'p-center', 'p-small', 'p-bold', 'p-italic', 'p-bold-italic', 'p-uppercase', 'p-quote', 'p-legendas', 'drop-cap', 'footnote', 'p-asterisk']));
    expect(sorted(TITLE_LIKE_CLASSES)).toEqual(sorted(['p-bold', 'p-uppercase', 'p-italic']));
    expect(sorted(STRUCTURAL_CLASSES)).toEqual(sorted(['footnote', 'footnote-ref', 'pagebreak', 'chapter-break']));
});

test('p-center e p-space aguentam-se num título', () => {
    expect(HEADING_STRIPPED_CLASSES).not.toContain('p-center');
    expect(HEADING_STRIPPED_CLASSES).not.toContain('p-space');
});

test('exclusão nos dois sentidos; sem exclusão = undefined', () => {
    expect(exclusiveOf('p-indent')).toBe('p-non-indent');
    expect(exclusiveOf('p-non-indent')).toBe('p-indent');
    expect(exclusiveOf('p-small')).toBeUndefined();
});

// Contra a deriva (p-asterisk estava no menu e em mais nenhum sítio): todo o estilo do menu é uma classe que o editor entende.
test('todos os estilos de bloco do menu constam da tabela', () => {
    const missing = BLOCK_CLASS_STYLES.map((s) => s.format).filter((f) => !EDITOR_CLASSES.has(f));
    expect(missing).toEqual([]);
});
