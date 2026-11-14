import type { BookRule } from '../../../../utils/book-rules';
import { planStyles, planStyleEdits, planStyleRemovals, classesForRules, type NewStyle, type StyleEdit } from '../../../../utils/book-styles';
import { runPlan, type BookOp } from '../aiPlan';
import { scopeRules } from '../aiSelection';
import type { AiTool } from './aiTool';

/** Os parâmetros do preview_rules que a ferramenta lê. Ver server/ai-contract.test.js, que os compara com o schema do servidor. */
export const PREVIEW_INPUT_KEYS = ['rules', 'styles', 'style_edits', 'style_deletes', 'operations'] as const;

/** Simula regras, estilos e operações sobre o livro SEM alterar nada e guarda a proposta (se válida e com efeito). */
export const previewRulesTool: AiTool = {
    name: 'preview_rules',
    run(input, { workspace, scope, propose }) {
        if (!Array.isArray(input.rules)) return { content: 'rules tem de ser uma lista', is_error: true };
        if (input.styles !== undefined && !Array.isArray(input.styles)) return { content: 'styles tem de ser uma lista', is_error: true };
        if (input.style_edits !== undefined && !Array.isArray(input.style_edits)) return { content: 'style_edits tem de ser uma lista', is_error: true };
        if (input.style_deletes !== undefined && !Array.isArray(input.style_deletes)) return { content: 'style_deletes tem de ser uma lista', is_error: true };
        if (input.operations !== undefined && !Array.isArray(input.operations)) return { content: 'operations tem de ser uma lista', is_error: true };
        const ops = (input.operations ?? []) as BookOp[];
        if (scope && ops.length) return { content: 'Há um bloco selecionado: só podes usar regras e estilos, sem "operations" (mexem no livro todo).', is_error: true };
        const rules = (scope ? scopeRules(input.rules as BookRule[], scope) : input.rules) as BookRule[];
        const plan = planStyles((input.styles ?? []) as NewStyle[], workspace.css());
        const editPlan = planStyleEdits((input.style_edits ?? []) as StyleEdit[], workspace.css());
        // as regras podem usar os estilos que esta proposta cria
        const known = classesForRules(workspace.css(), plan.planned.map((s) => s.cls));
        const run = runPlan(workspace.parts(), rules, ops, known);
        const removals = planStyleRemovals((input.style_deletes ?? []) as string[], workspace.css(), run.html);
        const errors = [...plan.errors, ...editPlan.errors, ...removals.errors, ...run.errors];
        const changes = run.reports.some((r) => r.changed > 0) || plan.planned.length > 0 || editPlan.planned.length > 0 || removals.planned.length > 0 || run.opResults.some((o) => o.changed);
        propose(!errors.length && changes ? { styles: plan.planned, edits: editPlan.planned, removals: removals.planned, rules, ops, opResults: run.opResults, reports: run.reports } : null);
        return { content: JSON.stringify({ errors, styles: plan.planned, style_edits: editPlan.planned, style_deletes: removals.planned, operations: run.opResults, reports: run.reports }) };
    },
};
