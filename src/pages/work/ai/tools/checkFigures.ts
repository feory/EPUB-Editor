import { reviewFigures } from '../../../../services/page-list/figure-audit';
import type { AiTool } from './aiTool';

/** "As figuras estão no sítio certo?": a posição de cada figura com legenda contra a ordem de leitura do PDF de impressão. Só lê. */
export const checkFiguresTool: AiTool = {
    name: 'check_figures',
    async run(_input, { workspace, suggest }) {
        const pdf = await workspace.pdfStyles();
        if (!pdf) return { content: 'Não há PDF de impressão carregado para este livro (ou não foi possível lê-lo): sem ele não se sabe onde as figuras estão no livro impresso. Carrega-o no painel do PDF.', is_error: true };
        const { diffs, checked, seen } = reviewFigures(workspace.parts().join(''), pdf);
        if (diffs.some((x) => x.fixable)) suggest({ label: 'Pôr as figuras no sítio', prompt: 'Põe as figuras no sítio segundo o PDF', edits: true });
        return { content: JSON.stringify({
            resumo: { figuras: seen, comLegendaEncontradaNoPdf: checked, comDiferencas: diffs.length },
            diferencas: diffs.map((d) => ({ tipo: d.kind === 'posicao' ? 'fora do sítio' : 'imagem e legenda trocadas', capitulo: d.chapter, legenda: d.caption, paginaNoPdf: d.page, depoisDoParagrafo: d.after, corrigivel: d.fixable, porque: d.why })),
            nota: 'só se veem figuras com legenda ("Figura N …") que o PDF confirma e só conta como fora do sítio a 2 ou mais páginas do texto (no impresso as figuras flutuam). As sem legenda ficam de fora. Corrige com preview_rules + operations [{ "type": "fix_figures" }].',
        }) };
    },
};
