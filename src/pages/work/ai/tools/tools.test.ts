// Cada ferramenta testada pela sua interface (`run`), sem o ciclo do agente nem modelo falso.
import { test, expect } from 'bun:test';
import '../../../../services/indesign/happy-dom'; // DOMParser no bun
import { memoryWorkspace } from '../testWorkspace';
import { surveyBookTool } from './surveyBook';
import { previewRulesTool } from './previewRules';
import { runValidationTool } from './runValidation';
import { checkPublicationTool } from './checkPublication';
import { AI_TOOLS } from './index';
import type { Proposal, ToolContext } from './aiTool';
import type { ValidationDigest, ValidationKind } from '../../../../utils/validation-digest';

const chapter = (title: string, body: string) => `<p class="chapter-break-h1" data-title="${title}"></p><h1>${title}</h1>${body}`;
const digest = (n: number): ValidationDigest => ({ source: 's', valid: !n, groups: n ? [{ rule: 'r', severity: 'aviso', count: n, description: '', files: [], examples: [] }] : [], omittedGroups: 0 });
const setup = (parts: string[] = [], over = {}, scope: ToolContext['scope'] = null, css = '') => {
    let proposal: Proposal | null = null;
    const ctx: ToolContext = { workspace: memoryWorkspace({ parts, css }, over), scope, propose: (p) => { proposal = p; } };
    return { ctx, proposal: () => proposal };
};

test('o registo tem uma ferramenta por nome', () => {
    const names = AI_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(['check_publication', 'preview_rules', 'run_validation', 'survey_book']);
});

test('survey_book: devolve o resumo do livro como está agora', () => {
    const { ctx } = setup([chapter('Um', '<p>a</p>')]);
    const out = JSON.parse((surveyBookTool.run({}, ctx) as { content: string }).content);
    expect(out.chapters).toEqual([{ index: 0, title: 'Um', level: 'h1' }]);
    ctx.workspace.parts().push(chapter('Dois', '<p>b</p>'));
    expect(JSON.parse((surveyBookTool.run({}, ctx) as { content: string }).content).chapters).toHaveLength(2);
});

test('preview_rules: valida o input, guarda a proposta só se válida e com efeito', async () => {
    const { ctx, proposal } = setup([chapter('Um', '<p>a</p><p>b</p>')]);
    const rule = { select: { tag: ['p'] }, action: { type: 'addClass', value: 'p-center' } };
    expect((await previewRulesTool.run({ rules: 'x' }, ctx)).is_error).toBe(true);
    expect(proposal()).toBeNull();
    const ok = JSON.parse((await previewRulesTool.run({ rules: [rule] }, ctx)).content);
    expect(ok.errors).toEqual([]);
    expect(proposal()?.reports[0].changed).toBe(2);
    await previewRulesTool.run({ rules: [{ ...rule, action: { type: 'addClass', value: 'inventada' } }] }, ctx);
    expect(proposal()).toBeNull(); // erro: a proposta anterior deixa de valer
});

test('preview_rules com blocos selecionados: recusa operações e limita as regras', async () => {
    const parts = [chapter('Um', '<p>a</p><p>b</p>')];
    const { ctx, proposal } = setup(parts, {}, { chapter: 0, index: 3, texts: ['b'] });
    expect((await previewRulesTool.run({ rules: [], operations: [{ type: 'drop_caps' }] }, ctx)).is_error).toBe(true);
    await previewRulesTool.run({ rules: [{ select: { tag: ['p'] }, action: { type: 'addClass', value: 'p-center' } }] }, ctx);
    expect(proposal()?.reports[0].changed).toBe(1);
});

test('run_validation: um tipo, todos por ordem, ACE por omissão; uma que falha não impede as outras', async () => {
    const order: ValidationKind[] = [];
    const { ctx } = setup([], { validate: async (k: ValidationKind) => { order.push(k); return k === 'links' ? null : digest(k === 'epub' ? 2 : 0); } });
    const all = JSON.parse((await runValidationTool.run({ type: 'all' }, ctx)).content).validacoes;
    expect(order).toEqual(['footnotes', 'links', 'epub', 'accessibility']);
    expect(all.map((v: { ok: boolean; erro?: string }) => (v.erro ? 'erro' : v.ok ? 'ok' : 'problemas'))).toEqual(['ok', 'erro', 'problemas', 'ok']);
    order.length = 0;
    await runValidationTool.run({}, ctx);
    expect(order).toEqual(['accessibility']);
});

test('run_validation: se nenhuma correu (modo leitura) é erro para o modelo explicar', async () => {
    const { ctx } = setup();
    const r = await runValidationTool.run({ type: 'all' }, ctx);
    expect(r.is_error).toBe(true);
    expect(r.content).toContain('Não foi possível correr a validação');
});

test('check_publication: sem dados do livro é erro; com dados junta factos e validações', async () => {
    expect((await checkPublicationTool.run({}, setup().ctx)).is_error).toBe(true);
    const facts = { metadata: { title: 'T', author: 'A', language: 'pt', ebook_isbn: '1' }, hasCover: false, images: { total: 0, withoutAlt: 0 }, indice: { exists: false, linked: 0, linkable: 0 }, pageMarkers: 0 };
    const { ctx } = setup([], { publicationFacts: async () => facts, validate: async () => digest(0) });
    const items = JSON.parse((await checkPublicationTool.run({}, ctx)).content).itens as { item: string; estado: string }[];
    expect(items.find((i) => i.item === 'Capa')?.estado).toBe('falta');
    expect(items.filter((i) => ['Links', 'EPUBCheck'].includes(i.item)).every((i) => i.estado === 'ok')).toBe(true);
});

test('preview_rules com style_deletes: propõe apagar o que nada usa; em uso é erro e não há proposta', async () => {
    const css = '/* === ESTILOS PERSONALIZADOS === */\n    .p-velho { color: red; }\n    .p-usado { color: blue; }\n/* === EDITOR (não exportado para EPUB) === */\n';
    const { ctx, proposal } = setup([chapter('Um', '<p class="p-usado">a</p>')], {}, null, css);
    const ok = JSON.parse((await previewRulesTool.run({ rules: [], style_deletes: ['p-velho'] }, ctx)).content);
    expect(ok.errors).toEqual([]);
    expect(ok.style_deletes).toEqual(['p-velho']);
    expect(proposal()?.removals).toEqual(['p-velho']);
    const bad = JSON.parse((await previewRulesTool.run({ rules: [], style_deletes: ['p-usado'] }, ctx)).content);
    expect(bad.errors[0]).toContain('está em uso');
    expect(proposal()).toBeNull();
    expect((await previewRulesTool.run({ rules: [], style_deletes: 'p-velho' }, ctx)).is_error).toBe(true);
});
