// Ciclo do assistente de IA, sem React nem rede: o servidor (server/routes/ai.js) dá UMA resposta por chamada; aqui
// executam-se as ferramentas que ela pede (têm de correr onde está o livro) e volta-se a chamar até haver texto final.
// O modelo só PROPÕE: `proposal` é a última simulação válida, e aplicá-la é um passo separado, do utilizador.
import { surveyBook } from '../../../utils/book-survey';
import type { BookRule, RuleReport } from '../../../utils/book-rules';
import { runPlan, type BookOp, type OpResult } from './aiPlan';
import { planStyles, planStyleEdits, type NewStyle, type PlannedStyle, type StyleEdit, type PlannedEdit } from '../../../utils/book-styles';
import { classesForRules } from '../../../utils/editor-classes';

type Block = { type: string; [key: string]: unknown };
export interface AgentMessage { role: 'user' | 'assistant'; content: string | Block[] }
export interface ChatResponse { content: Block[]; stop_reason: string | null }

export interface AgentResult {
    messages: AgentMessage[];
    text: string;
    proposal: { styles: PlannedStyle[]; edits: PlannedEdit[]; rules: BookRule[]; ops: BookOp[]; opResults: OpResult[]; reports: RuleReport[] } | null;
}

const MAX_TURNS = 8;
const textOf = (content: Block[]) => content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n').trim();

export async function runAgent(opts: {
    messages: AgentMessage[];
    send: (messages: AgentMessage[]) => Promise<ChatResponse>;
    book: { parts: string[]; css: string };
}): Promise<AgentResult> {
    let messages = opts.messages;
    let proposal: AgentResult['proposal'] = null;

    const execute = (tool: Block): { content: string; is_error?: true } => {
        const input = (tool.input ?? {}) as { rules?: unknown; styles?: unknown; style_edits?: unknown; operations?: unknown };
        if (tool.name === 'survey_book') return { content: JSON.stringify(surveyBook(opts.book.parts, opts.book.css)) };
        if (tool.name === 'preview_rules') {
            if (!Array.isArray(input.rules)) return { content: 'rules tem de ser uma lista', is_error: true };
            if (input.styles !== undefined && !Array.isArray(input.styles)) return { content: 'styles tem de ser uma lista', is_error: true };
            if (input.style_edits !== undefined && !Array.isArray(input.style_edits)) return { content: 'style_edits tem de ser uma lista', is_error: true };
            if (input.operations !== undefined && !Array.isArray(input.operations)) return { content: 'operations tem de ser uma lista', is_error: true };
            const ops = (input.operations ?? []) as BookOp[];
            const plan = planStyles((input.styles ?? []) as NewStyle[], opts.book.css);
            const editPlan = planStyleEdits((input.style_edits ?? []) as StyleEdit[], opts.book.css);
            // as regras podem usar os estilos que esta proposta cria
            const known = classesForRules(opts.book.css, plan.planned.map((s) => s.cls));
            const run = runPlan(opts.book.parts, input.rules as BookRule[], ops, known);
            const errors = [...plan.errors, ...editPlan.errors, ...run.errors];
            const changes = run.reports.some((r) => r.changed > 0) || plan.planned.length > 0 || editPlan.planned.length > 0 || run.opResults.some((o) => o.changed);
            proposal = !errors.length && changes ? { styles: plan.planned, edits: editPlan.planned, rules: input.rules as BookRule[], ops, opResults: run.opResults, reports: run.reports } : null;
            return { content: JSON.stringify({ errors, styles: plan.planned, style_edits: editPlan.planned, operations: run.opResults, reports: run.reports }) };
        }
        return { content: `ferramenta desconhecida: ${String(tool.name)}`, is_error: true };
    };

    for (let turn = 0; turn < MAX_TURNS; turn++) {
        const res = await opts.send(messages);
        messages = [...messages, { role: 'assistant', content: res.content }];
        if (res.stop_reason !== 'tool_use') {
            const text = textOf(res.content);
            const note = res.stop_reason === 'refusal' ? 'O assistente recusou este pedido.' : res.stop_reason === 'max_tokens' ? 'A resposta foi cortada.' : '';
            return { messages, text: text || note, proposal };
        }
        const results = res.content.filter((b) => b.type === 'tool_use').map((b) => ({ type: 'tool_result', tool_use_id: b.id, ...execute(b) }));
        messages = [...messages, { role: 'user', content: results }];
    }
    return { messages, text: 'O assistente excedeu o limite de passos. Reformula o pedido.', proposal };
}
