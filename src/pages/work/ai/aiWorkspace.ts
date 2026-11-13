// O LIVRO ABERTO, visto pela IA: tudo o que o assistente, a revisão de texto alternativo e o registo de alterações precisam do
// editor, numa só interface. O seam tem dois adapters: `useAiWorkspace` (o editor, em produção) e `memoryWorkspace`
// (testWorkspace.ts, em memória, nos testes). Os métodos leem o livro NA HORA da chamada (nunca uma cópia tirada antes), por
// isso uma ferramenta que corre depois de uma alteração aplicada já a vê. No modo leitura nada é lido para a IA validar nem se
// altera: a regra vive nos adapters, num só sítio.
import type { AiChange } from '../../../api/ebooks-api';
import type { ValidationDigest, ValidationKind } from '../../../utils/validation-digest';
import type { AiPlanInput } from './aiPlan';
import type { PublicationFacts } from './publicationChecklist';
import type { RuleBlock, SelectedBlocks } from './aiSelection';

export interface AiWorkspace {
    /** As partes do livro (1:1 com os capítulos) e o CSS, como estão agora. */
    parts(): string[];
    css(): string;
    language(): string;
    readOnly(): boolean;
    /** Aplica um plano (HTML + CSS juntos, ou nada). Devolve quando acabou; rejeita se não conseguiu gravar a versão anterior. */
    apply(plan: AiPlanInput, request: string, summary?: string[]): Promise<unknown>;
    /** Repõe o livro como estava antes de uma alteração (revert) ou como estava quando foi revertida (restore). Devolvem se conseguiram. */
    revert(change: AiChange): Promise<boolean>;
    restore(change: AiChange): Promise<boolean>;
    /** Corre uma validação e devolve o resumo; null se não foi possível (falhou, ou modo leitura). */
    validate(kind: ValidationKind): Promise<ValidationDigest | null>;
    /** Os dados do livro para a lista de verificação antes de exportar; null se não foi possível. */
    publicationFacts(): Promise<PublicationFacts | null>;
    /** Onde estão os blocos selecionados no editor, nas partes do livro; null se já não se encontram. */
    locate(selection: SelectedBlocks): RuleBlock | null;
}
