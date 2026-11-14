// Ciclo do assistente de IA, sem React nem rede: o servidor (server/routes/ai.js) dá UMA resposta por chamada; aqui
// executam-se as ferramentas que ela pede (têm de correr onde está o livro) e volta-se a chamar até haver texto final.
// O modelo só PROPÕE: `proposal` é a última simulação válida, e aplicá-la é um passo separado, do utilizador.
import type { AiWorkspace } from './aiWorkspace';
import type { RuleBlock } from './aiSelection';
import { runPlan } from './aiPlan';
import { AI_TOOLS } from './tools';
import type { Proposal, ToolContext, ToolResult } from './tools/aiTool';
import { charStyles, paragraphStyles } from '../../../utils/user-styles';
import { EDITOR_CLASSES } from '../../../utils/editor-classes';
import { classesForRules } from '../../../utils/book-styles';

type Block = { type: string; [key: string]: unknown };
export interface AgentMessage { role: 'user' | 'assistant'; content: string | Block[] }
export interface ChatResponse { content: Block[]; stop_reason: string | null }

export interface AgentResult {
    messages: AgentMessage[];
    text: string;
    proposal: Proposal | null;
}

const MAX_TURNS = 8;
const textOf = (content: Block[]) => content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n').trim();

export async function runAgent(opts: {
    messages: AgentMessage[];
    send: (messages: AgentMessage[]) => Promise<ChatResponse>;
    /** O livro aberto: as ferramentas leem-no na hora de cada chamada (ver aiWorkspace.ts). */
    workspace: AiWorkspace;
    /** Só este bloco: as regras ficam limitadas a ele e as operações (que mexem no livro todo) recusam-se. */
    scope?: RuleBlock | null;
}): Promise<AgentResult> {
    let messages = opts.messages;
    let proposal: AgentResult['proposal'] = null;
    const ctx: ToolContext = { workspace: opts.workspace, scope: opts.scope ?? null, propose: (p) => { proposal = p; } };

    const execute = async (call: Block): Promise<ToolResult> => {
        const tool = AI_TOOLS.find((t) => t.name === call.name);
        return tool ? tool.run((call.input ?? {}) as Record<string, unknown>, ctx) : { content: `ferramenta desconhecida: ${String(call.name)}`, is_error: true };
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
        deleted_styles: p.removals,
        style_edits: p.edits.map((e) => ({ selector: e.selector, antes: e.before, depois: e.after })),
        blocos_alterados: p.reports.reduce((n, r) => n + r.changed, 0),
    };
    return { role: 'user', content: `[Sistema: o utilizador APLICOU a proposta anterior. As alterações já estão gravadas no livro e a versão anterior ficou no histórico como "Antes de IA".]\n${JSON.stringify(summary)}` };
}

export const discardedNote = (): AgentMessage => ({ role: 'user', content: '[Sistema: o utilizador DESCARTOU a proposta anterior. Nada foi alterado no livro.]' });


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
        ...p.removals.map((cls) => `Estilo apagado .${cls}`),
        ...p.edits.map((e) => `Estilo ${e.selector}: ${e.before || '(sem regra)'} → ${e.after || '(vazio)'}`),
    ];
    return lines.slice(0, 30).map((l) => l.slice(0, 300));
}
