import { COMPRESS_LIMITS } from '../../../../../shared/ai-contract.js';
import type { AiTool } from './aiTool';

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

/** Comprime as imagens do livro no servidor (largura máxima + recodificação). Destrutivo: só a pedido explícito do utilizador. */
export const compressImagesTool: AiTool = {
    name: 'compress_images',
    async run(input, { workspace }) {
        if (workspace.readOnly()) return { content: 'Modo leitura: não se podem comprimir as imagens.', is_error: true };
        const { max_width, quality } = input;
        const res = await workspace.compressImages({
            maxWidth: typeof max_width === 'number' ? max_width : undefined,
            quality: typeof quality === 'number' ? quality : undefined,
        });
        if (!res) return { content: `Não foi possível comprimir as imagens (falhou, ou os valores estão fora dos limites: largura ${COMPRESS_LIMITS.maxWidth.min}–${COMPRESS_LIMITS.maxWidth.max}, qualidade ${COMPRESS_LIMITS.quality.min}–${COMPRESS_LIMITS.quality.max}).`, is_error: true };
        return { content: JSON.stringify({
            imagens: res.total, comprimidas: res.compressed, antes: mb(res.before), depois: mb(res.after),
            poupado: res.before ? `${Math.round((1 - res.after / res.before) * 100)}%` : '0%', larguraMaxima: res.maxWidth, qualidadeJpegWebp: res.quality,
            nota: 'As imagens foram substituídas no servidor (mesmo nome e extensão: o livro não muda); não há volta atrás, só reimportando as originais.',
        }) };
    },
};
