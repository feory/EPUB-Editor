// Uma ferramenta do assistente: o que o modelo pode pedir ao editor. Cada uma é um módulo com esta interface; `runAgent` só
// as despacha por nome (ver index.ts). O schema que o modelo vê vive no servidor (server/routes/ai.js); server/ai-contract.test.js
// garante que os nomes são os mesmos dos dois lados.
import type { BookRule, RuleReport } from '../../../../utils/book-rules';
import type { PlannedStyle, PlannedEdit } from '../../../../utils/book-styles';
import type { AiWorkspace } from '../aiWorkspace';
import type { RuleBlock } from '../aiSelection';
import type { BookOp, OpResult } from '../aiPlan';

/** A proposta do modelo: o que mudaria no livro, simulado; só se aplica quando o utilizador carrega em Aplicar. */
export interface Proposal { styles: PlannedStyle[]; edits: PlannedEdit[]; rules: BookRule[]; ops: BookOp[]; opResults: OpResult[]; reports: RuleReport[] }

export interface ToolResult { content: string; is_error?: true }

export interface ToolContext {
    /** O livro aberto: as ferramentas leem-no na hora de cada chamada. */
    workspace: AiWorkspace;
    /** Só estes blocos: as regras ficam limitadas a eles e as operações (que mexem no livro todo) recusam-se. */
    scope: RuleBlock | null;
    /** A ferramenta que simula alterações diz aqui qual é a proposta atual (null = nenhuma válida). */
    propose(proposal: Proposal | null): void;
}

export interface AiTool {
    name: string;
    run(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> | ToolResult;
}
