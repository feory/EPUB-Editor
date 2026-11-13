import { test, expect } from 'bun:test';
import { digestValidation } from './validation-digest';

const issue = (rule: string, html?: string, file = 'section0001.xhtml') => ({ message: `${rule} msg`, rule, description: `${rule} descrição`, impact: 'serious', file, html });

test('agrupa por regra, com contagem, ficheiros e exemplos sem repetir', () => {
    const d = digestValidation({ valid: false, errors: [issue('color-contrast', '<p>a</p>'), issue('color-contrast', '<p>a</p>', 'section0002.xhtml'), issue('color-contrast', '<p>b</p>'), issue('link-name')], warnings: [] }, 'accessibility');
    expect(d.groups[0]).toMatchObject({ rule: 'color-contrast', severity: 'erro', count: 3, files: ['section0001.xhtml', 'section0002.xhtml'], examples: ['<p>a</p>', '<p>b</p>'] });
    expect(d.groups[1]).toMatchObject({ rule: 'link-name', count: 1 });
    expect(d.source).toContain('ACE');
});

test('erros antes de avisos; dentro de cada, o mais frequente primeiro', () => {
    const d = digestValidation({ valid: false, errors: [issue('e1')], warnings: [issue('w1'), issue('w2'), issue('w2')] }, 'epub');
    expect(d.groups.map((g) => g.rule)).toEqual(['e1', 'w2', 'w1']);
    expect(d.groups.map((g) => g.severity)).toEqual(['erro', 'aviso', 'aviso']);
});

test('corta grupos e exemplos longos, e diz quantos ficaram de fora', () => {
    const many = Array.from({ length: 30 }, (_, i) => issue(`r${i}`, `<p>${'x'.repeat(500)}</p>`));
    const d = digestValidation({ valid: false, errors: many, warnings: [] }, 'accessibility');
    expect(d.groups).toHaveLength(25);
    expect(d.omittedGroups).toBe(5);
    expect(d.groups[0].examples[0].length).toBe(200);
});

test('sem regra usa o início da mensagem; relatório vazio dá zero grupos', () => {
    expect(digestValidation({ valid: false, errors: [{ message: 'Metadados em falta: a11y:x' }], warnings: [] }, 'accessibility').groups[0].rule).toBe('Metadados em falta: a11y:x');
    expect(digestValidation({ valid: true, errors: [], warnings: [] }, 'epub').groups).toEqual([]);
});

test('notas e links viram o mesmo resumo, agrupado por tipo', async () => {
    const { digestFootnotes, digestLinks, VALIDATION_ORDER } = await import('./validation-digest');
    const d = digestFootnotes({ totalRefs: 2, totalNotes: 1, issues: [{ type: 'orphan-ref', message: 'sem nota', marker: '2', context: '<sup>2</sup>' }, { type: 'orphan-ref', message: 'sem nota', marker: '3' }] });
    expect(d.source).toBe('Notas de rodapé');
    expect(d.groups).toEqual([{ rule: 'orphan-ref', severity: 'aviso', impact: undefined, count: 2, description: 'sem nota', files: [], examples: ['<sup>2</sup>'] }]);
    expect(digestLinks({ totalLinks: 3, issues: [] }).groups).toEqual([]);
    expect(VALIDATION_ORDER).toEqual(['footnotes', 'links', 'epub', 'accessibility']);
});
