// Ciclo do assistente de IA, sem React nem rede: o servidor (server/routes/ai.js) dá UMA resposta por chamada; aqui
// executam-se as ferramentas que ela pede (têm de correr onde está o livro) e volta-se a chamar até haver texto final.
// O modelo só PROPÕE: `proposal` é a última simulação válida, e aplicá-la é um passo separado, do utilizador.
import { surveyBook } from '../../../utils/book-survey';
import type { BookRule, RuleReport } from '../../../utils/book-rules';
import { VALIDATION_ORDER, type ValidationKind, type ValidationDigest } from '../../../utils/validation-digest';
import { scopeRules, type RuleBlock } from './aiSelection';
import { runPlan, type BookOp, type OpResult } from './aiPlan';
import { charStyles, paragraphStyles } from '../../../utils/user-styles';
import { EDITOR_CLASSES } from '../../../utils/editor-classes';
import { planStyles, planStyleEdits, classesForRules, type NewStyle, type PlannedStyle, type StyleEdit, type PlannedEdit } from '../../../utils/book-styles';

type Block = { type: string; [key: string]: unknown };
export interface AgentMessage { role: 'user' | 'assistant'; content: string | Block[] }
export interface ChatResponse { content: Block[]; stop_reason: string | null }

export interface AgentResult {
    messages: AgentMessage[];
    text: string;
    proposal: { styles: PlannedStyle[]; edits: PlannedEdit[]; rules: BookRule[]; ops: BookOp[]; opResults: OpResult[]; reports: RuleReport[] } | null;
}

const MAX_TURNS = 8;
/** Os parâmetros do preview_rules que `execute` lê. Ver server/ai-contract.test.js, que os compara com o schema do servidor. */
export const PREVIEW_INPUT_KEYS = ['rules', 'styles', 'style_edits', 'operations'] as const;
const textOf = (content: Block[]) => content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n').trim();

export async function runAgent(opts: {
    messages: AgentMessage[];
    send: (messages: AgentMessage[]) => Promise<ChatResponse>;
    book: { parts: string[]; css: string };
    /** Só este bloco: as regras ficam limitadas a ele e as operações (que mexem no livro todo) recusam-se. */
    scope?: RuleBlock | null;
    /** Corre uma validação sobre o livro como está agora e devolve o resumo; null se não foi possível. */
    validate?: (kind: ValidationKind) => Promise<ValidationDigest | null>;
}): Promise<AgentResult> {
    let messages = opts.messages;
    let proposal: AgentResult['proposal'] = null;

    const execute = async (tool: Block): Promise<{ content: string; is_error?: true }> => {
        const input = (tool.input ?? {}) as { rules?: unknown; styles?: unknown; style_edits?: unknown; operations?: unknown };
        if (tool.name === 'survey_book') return { content: JSON.stringify(surveyBook(opts.book.parts, opts.book.css)) };
        if (tool.name === 'run_validation') {
            const type = (tool.input as { type?: unknown } | undefined)?.type;
            const kinds: readonly ValidationKind[] = type === 'all' ? VALIDATION_ORDER : (VALIDATION_ORDER as readonly unknown[]).includes(type) ? [type as ValidationKind] : ['accessibility'];
            const done: { validacao: ValidationKind; ok: boolean; problemas: number; detalhe?: ValidationDigest; erro?: string }[] = [];
            for (const kind of kinds) { // por ordem; uma que falhe não impede as outras
                const digest = await opts.validate?.(kind);
                if (!digest) { done.push({ validacao: kind, ok: false, problemas: 0, erro: 'não foi possível correr (modo leitura ou falhou)' }); continue; }
                const problems = digest.groups.reduce((n, g) => n + g.count, 0);
                done.push(problems ? { validacao: kind, ok: false, problemas: problems, detalhe: digest } : { validacao: kind, ok: true, problemas: 0 });
            }
            if (done.every((d) => d.erro)) return { content: 'Não foi possível correr a validação (modo leitura ou falhou). Diz ao utilizador para a correr no menu Validações.', is_error: true };
            return { content: JSON.stringify({ validacoes: done }) };
        }
        if (tool.name === 'preview_rules') {
            if (!Array.isArray(input.rules)) return { content: 'rules tem de ser uma lista', is_error: true };
            if (input.styles !== undefined && !Array.isArray(input.styles)) return { content: 'styles tem de ser uma lista', is_error: true };
            if (input.style_edits !== undefined && !Array.isArray(input.style_edits)) return { content: 'style_edits tem de ser uma lista', is_error: true };
            if (input.operations !== undefined && !Array.isArray(input.operations)) return { content: 'operations tem de ser uma lista', is_error: true };
            const ops = (input.operations ?? []) as BookOp[];
            if (opts.scope && ops.length) return { content: 'Há um bloco selecionado: só podes usar regras e estilos, sem "operations" (mexem no livro todo).', is_error: true };
            const rules = (opts.scope ? scopeRules(input.rules as BookRule[], opts.scope) : input.rules) as BookRule[];
            const plan = planStyles((input.styles ?? []) as NewStyle[], opts.book.css);
            const editPlan = planStyleEdits((input.style_edits ?? []) as StyleEdit[], opts.book.css);
            // as regras podem usar os estilos que esta proposta cria
            const known = classesForRules(opts.book.css, plan.planned.map((s) => s.cls));
            const run = runPlan(opts.book.parts, rules, ops, known);
            const errors = [...plan.errors, ...editPlan.errors, ...run.errors];
            const changes = run.reports.some((r) => r.changed > 0) || plan.planned.length > 0 || editPlan.planned.length > 0 || run.opResults.some((o) => o.changed);
            proposal = !errors.length && changes ? { styles: plan.planned, edits: editPlan.planned, rules, ops, opResults: run.opResults, reports: run.reports } : null;
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
        const results: Block[] = [];
        for (const b of res.content.filter((x) => x.type === 'tool_use')) results.push({ type: 'tool_result', tool_use_id: b.id, ...(await execute(b)) });
        messages = [...messages, { role: 'user', content: results }];
    }
    return { messages, text: 'O assistente excedeu o limite de passos. Reformula o pedido.', proposal };
}

/**
 * O que o modelo tem de saber DEPOIS de o utilizador carregar em Aplicar: o botão é da interface, não passa pela conversa, e sem
 * esta nota o modelo achava que "nada foi aplicado". Leva o suficiente (regras, operações, valores antigos dos estilos) para
 * conseguir propor o inverso se o utilizador pedir para reverter.
 */
export function appliedNote(p: NonNullable<AgentResult['proposal']>): AgentMessage {
    const summary = {
        rules: p.rules,
        operations: p.ops.filter((o) => o.type !== 'set_image_alts'),
        new_styles: p.styles,
        style_edits: p.edits.map((e) => ({ selector: e.selector, antes: e.before, depois: e.after })),
        blocos_alterados: p.reports.reduce((n, r) => n + r.changed, 0),
    };
    return { role: 'user', content: `[Sistema: o utilizador APLICOU a proposta anterior. As alterações já estão gravadas no livro e a versão anterior ficou no histórico como "Antes de IA".]\n${JSON.stringify(summary)}` };
}

export const discardedNote = (): AgentMessage => ({ role: 'user', content: '[Sistema: o utilizador DESCARTOU a proposta anterior. Nada foi alterado no livro.]' });

type Proposal = NonNullable<AgentResult['proposal']>;

/**
 * O utilizador muda o nome de um estilo NOVO da proposta antes de aplicar. A classe nova (c-nome para caracteres) troca-se em
 * todo o lado onde a proposta a usa — o estilo, as regras que a acrescentam e as operações que a aplicam — e a simulação
 * refaz-se, para os exemplos e contagens mostrarem o nome certo. Devolve o erro se o nome não serve ou já existe.
 */
export function renameProposalStyle(p: Proposal, oldCls: string, newName: string, book: { parts: string[]; css: string }): { proposal: Proposal } | { error: string } {
    if (!p.styles.some((s) => s.cls === oldCls)) return { error: 'Esse estilo já não está na proposta.' };
    const kind = charStyles.isStyle(oldCls) ? charStyles : paragraphStyles;
    const cls = kind.classOf(newName);
    if (!cls) return { error: 'Escolhe um nome com letras ou números.' };
    if (cls === oldCls) return { proposal: p };
    const taken = new Set([...EDITOR_CLASSES, ...classesForRules(book.css), ...p.styles.filter((s) => s.cls !== oldCls).map((s) => s.cls)]);
    if (taken.has(cls)) return { error: `Já existe um estilo ".${cls}".` };

    const styles = p.styles.map((s) => (s.cls === oldCls ? { ...s, cls } : s));
    const rules = p.rules.map((r) => ((r.action.type === 'addClass' || r.action.type === 'removeClass') && r.action.value === oldCls ? { ...r, action: { ...r.action, value: cls } } : r));
    const ops = p.ops.map((o) => (o.type === 'inline_style_to_class' && o.cls === oldCls ? { ...o, cls } : o));
    const run = runPlan(book.parts, rules, ops, classesForRules(book.css, styles.map((s) => s.cls)));
    if (run.errors.length) return { error: run.errors.join('; ') };
    return { proposal: { ...p, styles, rules, ops, reports: run.reports, opResults: run.opResults } };
}

/** O resumo legível do que uma proposta fez, para o registo das alterações (até 30 linhas de 300 caracteres). */
export function summarizeProposal(p: Proposal): string[] {
    const lines = [
        ...p.reports.flatMap((r, i) => (r.changed > 0 ? [`Regra ${i + 1}: ${r.changed} ${r.changed === 1 ? 'bloco' : 'blocos'} em ${r.chapters.length} ${r.chapters.length === 1 ? 'capítulo' : 'capítulos'}`] : [])),
        ...p.opResults.filter((o) => o.changed).map((o) => `${o.label}: ${o.summary}`),
        ...p.styles.map((s) => `Estilo novo .${s.cls} { ${s.body} }`),
        ...p.edits.map((e) => `Estilo ${e.selector}: ${e.before || '(sem regra)'} → ${e.after || '(vazio)'}`),
    ];
    return lines.slice(0, 30).map((l) => l.slice(0, 300));
}
