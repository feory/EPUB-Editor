import type { AiTool } from './aiTool';
import type { MissingReason } from '../../../../services/page-list/page-list';

const WHY: Record<MissingReason, string> = {
    'branca': 'página em branco (só folio e marcas do InDesign): não precisa de marcador',
    'indice': 'página do Índice: não leva marcadores (de propósito)',
    'figura': 'só figura: o texto da página não está no corpo (está na imagem), por isso não há onde o ancorar',
    'abre-com-figura': 'a página abre com texto de uma figura (que o livro não tem) e o resto do texto ESTÁ no livro: o marcador só entra à mão',
    'fora-de-ordem': 'o texto da página ESTÁ no livro, mas o marcador não entrou (ordem diferente da do PDF): é a que vale a pena rever',
};

/** "O que falta na lista de páginas?": as páginas do PDF sem marcador no livro, agrupadas pelo motivo (ver auditPageList). */
export const checkPageListTool: AiTool = {
    name: 'check_page_list',
    async run(_input, { workspace }) {
        const audit = await workspace.pageListAudit();
        if (!audit) return { content: 'Não há PDF de impressão carregado para este livro (ou não foi possível lê-lo): sem ele não se sabe que páginas existem. Carrega-o no painel do PDF.', is_error: true };
        const semMarcador: Record<string, number[]> = {};
        for (const m of audit.missing) (semMarcador[WHY[m.reason]] ??= []).push(m.page);
        return { content: JSON.stringify({
            resumo: { paginasComFolio: audit.pagesWithFolio, comMarcador: audit.marked, semMarcador: audit.missing.length, paginasSemFolio: audit.withoutFolio },
            semMarcador,
            marcadoresSemPaginaNoPdf: audit.orphanMarkers,
            nota: audit.marked === 0 ? 'o livro não tem nenhum marcador: a lista de páginas ainda não foi gerada (gera-se no painel do PDF)' : undefined,
        }) };
    },
};
