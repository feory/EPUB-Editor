import { test, expect } from 'bun:test';
import '../../../services/indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
const { OPS, OP_TYPES, opLabel, validateOps } = await import('./aiOps');

test('cada operação tem rótulo e os tipos saem do catálogo', () => {
    expect(OP_TYPES.length).toBeGreaterThan(10);
    for (const type of OP_TYPES) expect(OPS[type as keyof typeof OPS].label.length).toBeGreaterThan(2);
    expect(opLabel({ type: 'drop_caps' })).toBe('Capitulares');
});

test('validateOps: tipo desconhecido, index inteiro e a validação própria da operação', () => {
    expect(validateOps([{ type: 'nope' } as never])).toEqual(['operação 1: tipo desconhecido']);
    expect(validateOps([{ type: 'hide_chapter', index: 1.5, hidden: true }])).toEqual(['operação 1: "index" tem de ser um inteiro']);
    expect(validateOps([{ type: 'set_chapter_level', index: 0, level: 'h9' as never }])).toEqual(['operação 1: nível tem de ser h1, h2 ou h3']);
    expect(validateOps([{ type: 'drop_caps' }])).toEqual([]);
});

test('keep_figures_together corre pelo plano e é idempotente', async () => {
    const { runPlan } = await import('./aiPlan');
    const part = '<p class="chapter-break-h1" data-title="Um"></p><p>Texto do capítulo um.</p><img data-image-id="a" src="x" alt=""><p class="p-legendas">Figura 1.1 Legenda</p>';
    const r = runPlan([part], [], [{ type: 'keep_figures_together' }]);
    expect(r.errors).toEqual([]);
    expect(r.html).toContain('<div class="noBreak"><img data-image-id="a"');
    expect(r.opResults[0]).toMatchObject({ label: 'Figuras unidas à legenda', changed: true });
    expect(runPlan([r.html], [], [{ type: 'keep_figures_together' }]).opResults[0].changed).toBe(false);
});
