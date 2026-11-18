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
import type { PageListAudit } from '../../../services/page-list/audit';
import type { PageLines } from '../../../services/page-list/alignment';
import type { PdfStyles } from '../../../services/page-list/pdf-styles';

export interface AiWorkspace {
    /** O título do livro (para cabeçalhos de relatório). */
    title(): string;
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
    /** Cruza o PDF de impressão com os marcadores de página do livro; null se não há PDF carregado ou não foi possível lê-lo. */
    pageListAudit(): Promise<PageListAudit | null>;
    /** As páginas do PDF sem marcador, com as linhas que o livro também tem (o que fix_page_list precisa); null sem PDF. */
    pageLines(): Promise<PageLines[] | null>;
    /** A geometria e o estilo (margens, recuos, negrito/itálico, tamanhos) do PDF de impressão, o que fix_styles e check_styles comparam com o livro; null sem PDF. */
    pdfStyles(): Promise<PdfStyles | null>;
    /** Comprime as imagens do livro no servidor (reduz a largura e recodifica; sem volta atrás); null se não foi possível (modo leitura, ou falhou). */
    compressImages(opts: { maxWidth?: number; quality?: number }): Promise<{ total: number; compressed: number; before: number; after: number; maxWidth: number; quality: number } | null>;
    /** Onde estão os blocos selecionados no editor, nas partes do livro; null se já não se encontram. */
    locate(selection: SelectedBlocks): RuleBlock | null;
}
