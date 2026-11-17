import { reviewStyles } from '../../../../services/page-list/style-audit';
import type { AiTool } from './aiTool';

const EXAMPLES = 8; // por tipo de diferença

/** "O estilo dos parágrafos bate com o PDF?": a indentação, o negrito/itálico, o centrado, a letra pequena e o espaço acima do livro contra os do PDF de impressão. Só lê. */
export const checkStylesTool: AiTool = {
    name: 'check_styles',
    async run(_input, { workspace, suggest }) {
        const pdf = await workspace.pdfStyles();
        if (!pdf) return { content: 'Não há PDF de impressão carregado para este livro (ou não foi possível lê-lo): sem ele não se sabe como o livro impresso está formatado. Carrega-o no painel do PDF.', is_error: true };
        const { diffs, checked, seen } = reviewStyles(workspace.parts().join(''), pdf);
        const grupos: Record<string, { add: string[]; remove: string[]; exemplos: { capitulo: string; pagina: number; texto: string }[]; total: number }> = {};
        for (const d of diffs) {
            const g = (grupos[`${d.kind}: ${d.why}`] ??= { add: d.add, remove: d.remove, exemplos: [], total: 0 });
            g.total++;
            if (g.exemplos.length < EXAMPLES) g.exemplos.push({ capitulo: d.chapter, pagina: d.page, texto: d.text });
        }
        if (diffs.length) suggest({ label: 'Corrigir estilos pelo PDF', prompt: 'Corrige os estilos pelo PDF', edits: true });
        return { content: JSON.stringify({
            resumo: { paragrafosVistos: seen, encontradosNoPdf: checked, comDiferencas: diffs.length },
            diferencas: grupos,
            nota: 'só se reveem os parágrafos soltos que o PDF confirma; caixas, listas, tabelas, citações, legendas, notas e o Índice ficam de fora. Corrige com preview_rules + operations [{ "type": "fix_styles" }].',
        }) };
    },
};
