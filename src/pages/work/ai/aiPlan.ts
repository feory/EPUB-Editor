// Plano da IA sobre o livro: regras (book-rules.ts) e depois operações que o editor já sabe fazer (bookEdit.ts), tudo
// em memória e em sequência. É a MESMA função na simulação (o modelo vê o efeito) e ao aplicar (o que se grava), por
// isso o que o utilizador confirma é o que acontece. Só operações seguras: ficam de fora mover/eliminar/duplicar/criar
// capítulos (mudam os índices a meio do plano). A lista de páginas (fix_page_list) precisa do PDF: quem a pede (a ferramenta
// preview_rules) mete na operação o resumo das páginas (`pages`), por isso o plano continua autocontido e igual ao aplicar.
import { runRules, type BookRule } from '../../../utils/book-rules';
import { splitChapters, classifyChapterPart } from '../../../utils/chapters';
import { applyStylePlan, planStyleRemovals, type PlannedStyle, type PlannedEdit } from '../../../utils/book-styles';
import type { Book } from '../bookEdit';
import { validateOps, runOp, opLabel, type BookOp, type OpResult, type PlanResult } from './aiOps';

export { OP_TYPES, validateOps, type BookOp, type OpResult, type PlanResult } from './aiOps';

const bookOf = (parts: string[]): Book => ({ html: parts.join(''), parts, chapters: parts.map((p, i) => classifyChapterPart(p, i)) });

export function runPlan(parts: string[], rules: BookRule[], ops: BookOp[], known?: ReadonlySet<string>): PlanResult {
    const opErrors = validateOps(ops);
    const run = runRules(parts, rules, known);
    const errors = [...run.errors, ...opErrors];
    if (errors.length) return { html: parts.join(''), reports: run.reports, opResults: [], errors };

    let html = run.parts.join('');
    let book = bookOf(splitChapters(html)); // as regras podem ter criado marcadores (h3 → h2): volta a partir em capítulos
    const opResults: OpResult[] = [];
    ops.forEach((op, i) => {
        const step = runOp(book, op, known);
        if (step.error) { errors.push(`operação ${i + 1}: ${step.error}`); return; }
        opResults.push({ label: opLabel(op), changed: step.html !== undefined && step.html !== html, summary: step.summary });
        if (step.html !== undefined && step.html !== html) { html = step.html; book = bookOf(splitChapters(html)); }
    });
    return { html, reports: run.reports, opResults, errors };
}

export interface AiPlanInput { rules: BookRule[]; ops: BookOp[]; styles: PlannedStyle[]; edits: PlannedEdit[]; /** Estilos do utilizador a apagar (só os que nada usa depois do plano). */ removals?: string[] }

/**
 * O resultado COMPLETO de um plano (HTML e CSS), calculado sem tocar em nada: quem aplica só grava depois de ver `errors`
 * vazio, por isso nunca fica o HTML alterado e o CSS não (ou ao contrário).
 */
export function resolvePlan(parts: string[], css: string, plan: AiPlanInput): { html: string; css: string; errors: string[] } {
    const run = runPlan(parts, plan.rules, plan.ops);
    const removals = planStyleRemovals(plan.removals ?? [], css, run.html);
    const styled = applyStylePlan(css, plan.styles, plan.edits, removals.planned);
    const errors = [...run.errors, ...removals.errors, ...styled.errors];
    return errors.length ? { html: parts.join(''), css, errors } : { html: run.html, css: styled.css, errors };
}

/** Acesso ao CSS do livro que o plano precisa: ler o atual e gravar o novo. */
export interface AiCssSide { get(): string; set(next: string): void }

/** Os ficheiros do histórico guardados ao aplicar um plano (para o poder repor): o HTML só se mudou, o CSS só se mudou. */
export interface AiSnapshots { htmlFile?: string; cssFile?: string }
