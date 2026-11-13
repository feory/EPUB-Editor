import { VALIDATION_ORDER, type ValidationKind, type ValidationDigest } from '../../../../utils/validation-digest';
import type { AiTool } from './aiTool';

/** Corre uma validação, ou todas por ordem (`type: "all"`); por omissão o ACE. Uma que falhe não impede as outras. */
export const runValidationTool: AiTool = {
    name: 'run_validation',
    async run(input, { workspace }) {
        const type = input.type;
        const kinds: readonly ValidationKind[] = type === 'all' ? VALIDATION_ORDER : (VALIDATION_ORDER as readonly unknown[]).includes(type) ? [type as ValidationKind] : ['accessibility'];
        const done: { validacao: ValidationKind; ok: boolean; problemas: number; detalhe?: ValidationDigest; erro?: string }[] = [];
        for (const kind of kinds) {
            const digest = await workspace.validate(kind);
            if (!digest) { done.push({ validacao: kind, ok: false, problemas: 0, erro: 'não foi possível correr (modo leitura ou falhou)' }); continue; }
            const problems = digest.groups.reduce((n, g) => n + g.count, 0);
            done.push(problems ? { validacao: kind, ok: false, problemas: problems, detalhe: digest } : { validacao: kind, ok: true, problemas: 0 });
        }
        if (done.every((d) => d.erro)) return { content: 'Não foi possível correr a validação (modo leitura ou falhou). Diz ao utilizador para a correr no menu Validações.', is_error: true };
        return { content: JSON.stringify({ validacoes: done }) };
    },
};
