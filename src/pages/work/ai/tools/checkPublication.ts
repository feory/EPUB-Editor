import { VALIDATION_ORDER, type ValidationKind, type ValidationDigest } from '../../../../utils/validation-digest';
import { buildChecklist } from '../publicationChecklist';
import type { AiTool } from './aiTool';

/** "O livro está pronto?": os dados do livro e as quatro validações juntos numa lista de itens (ver publicationChecklist.ts). */
export const checkPublicationTool: AiTool = {
    name: 'check_publication',
    async run(_input, { workspace }) {
        const facts = await workspace.publicationFacts();
        if (!facts) return { content: 'Não foi possível ler os dados do livro.', is_error: true };
        const validations: { kind: ValidationKind; digest: ValidationDigest | null }[] = [];
        for (const kind of VALIDATION_ORDER) validations.push({ kind, digest: await workspace.validate(kind) });
        return { content: JSON.stringify({ itens: buildChecklist(facts, validations), validacoesSemDetalhe: 'para o detalhe de uma validação com problemas chama run_validation com o seu type' }) };
    },
};
