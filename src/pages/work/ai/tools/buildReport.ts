import { buildBookReport } from '../bookReport';
import type { AiTool } from './aiTool';

/** "Prepara um relatório com todas as falhas": junta as verificações num texto (.txt) que a interface oferece para descarregar. Só lê o livro; demora (corre as validações). */
export const buildReportTool: AiTool = {
    name: 'build_report',
    async run(_input, { workspace, deliver }) {
        const report = await buildBookReport(workspace);
        deliver(report.text);
        return { content: JSON.stringify({
            pronto: true,
            falhasPorSecao: report.counts,
            naoFeito: report.skipped,
            nota: 'O relatório (com cada falha, a localização e um excerto do texto) fica num botão "Descarregar .txt" por baixo da tua resposta. Não o copies para a conversa: diz só quantas falhas há por secção e que o descarreguem.',
        }) };
    },
};
