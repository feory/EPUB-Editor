import type { AiTool } from './aiTool';

const MAX_PAGES = 25;     // páginas do PDF listadas
const PER_PAGE = 3;       // linhas por página
const EXCERPT = 100;

/**
 * "O livro tem o texto do impresso?": as linhas do PDF que faltam no livro, por página (ver auditText). Só lê.
 * De propósito não mostra o que auditText também calcula e dava sobretudo falsos positivos: os blocos só no livro, as páginas de colunas/tabelas
 * (não comparadas) e o provável texto de figuras (diagramas que o livro tem como imagem).
 */
export const checkTextTool: AiTool = {
    name: 'check_text',
    async run(_input, { workspace }) {
        const audit = await workspace.textAudit();
        if (!audit) return { content: 'Não há PDF de impressão carregado para este livro (ou não foi possível lê-lo): sem ele não se sabe qual é o texto impresso. Carrega-o no painel do PDF.', is_error: true };
        const porPagina = new Map<number, string[]>();
        for (const m of audit.missing) (porPagina.get(m.page) ?? porPagina.set(m.page, []).get(m.page)!).push(m.text.slice(0, EXCERPT));
        return { content: JSON.stringify({
            resumo: { linhasDoPdf: audit.pdfLines, linhasQueFaltamNoLivro: audit.missing.length },
            faltaNoLivro: [...porPagina].slice(0, MAX_PAGES).map(([paginaPdf, linhas]) => ({ paginaPdf, linhas: linhas.length, exemplos: linhas.slice(0, PER_PAGE) })),
            paginasComFaltas: porPagina.size,
            nota: 'sem operação que corrija: o texto repõe-se à mão. Só se compara o texto de corpo: páginas com colunas ou tabelas, texto de diagramas (imagens no livro), Índice, ficha técnica e cabeçalhos correntes não entram. Notas de rodapé podem dar falsos positivos. No máximo 200 achados.',
        }) };
    },
};
