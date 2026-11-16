// Cada ferramenta testada pela sua interface (`run`), sem o ciclo do agente nem modelo falso.
import { test, expect } from 'bun:test';
import '../../../../services/indesign/happy-dom'; // DOMParser no bun
import { memoryWorkspace } from '../testWorkspace';
import { surveyBookTool } from './surveyBook';
import { previewRulesTool } from './previewRules';
import { runValidationTool } from './runValidation';
import { checkPublicationTool } from './checkPublication';
import { checkPageListTool } from './checkPageList';
import { checkStylesTool } from './checkStyles';
import { checkFiguresTool } from './checkFigures';
import { buildReportTool } from './buildReport';
import type { PdfStyles } from '../../../../services/page-list/pdf-styles';
import { AI_TOOLS } from './index';
import type { Proposal, ToolContext } from './aiTool';
import type { ValidationDigest, ValidationKind } from '../../../../utils/validation-digest';

const chapter = (title: string, body: string) => `<p class="chapter-break-h1" data-title="${title}"></p><h1>${title}</h1>${body}`;
const digest = (n: number): ValidationDigest => ({ source: 's', valid: !n, groups: n ? [{ rule: 'r', severity: 'aviso', count: n, description: '', files: [], examples: [] }] : [], omittedGroups: 0 });
const setup = (parts: string[] = [], over = {}, scope: ToolContext['scope'] = null, css = '') => {
    let proposal: Proposal | null = null;
    let report: string | null = null;
    const ctx: ToolContext = { workspace: memoryWorkspace({ parts, css }, over), scope, propose: (p) => { proposal = p; }, deliver: (r) => { report = r; } };
    return { ctx, proposal: () => proposal, report: () => report };
};

test('o registo tem uma ferramenta por nome', () => {
    const names = AI_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(['build_report', 'check_figures', 'check_page_list', 'check_publication', 'check_styles', 'preview_rules', 'run_validation', 'survey_book']);
});

test('survey_book: devolve o resumo do livro como está agora', () => {
    const { ctx } = setup([chapter('Um', '<p>a</p>')]);
    const out = JSON.parse((surveyBookTool.run({}, ctx) as { content: string }).content);
    expect(out.chapters).toEqual([{ index: 0, title: 'Um', level: 'h1' }]);
    ctx.workspace.parts().push(chapter('Dois', '<p>b</p>'));
    expect(JSON.parse((surveyBookTool.run({}, ctx) as { content: string }).content).chapters).toHaveLength(2);
});

test('preview_rules: valida o input, guarda a proposta só se válida e com efeito', async () => {
    const { ctx, proposal } = setup([chapter('Um', '<p>a</p><p>b</p>')]);
    const rule = { select: { tag: ['p'] }, action: { type: 'addClass', value: 'p-center' } };
    expect((await previewRulesTool.run({ rules: 'x' }, ctx)).is_error).toBe(true);
    expect(proposal()).toBeNull();
    const ok = JSON.parse((await previewRulesTool.run({ rules: [rule] }, ctx)).content);
    expect(ok.errors).toEqual([]);
    expect(proposal()?.reports[0].changed).toBe(2);
    await previewRulesTool.run({ rules: [{ ...rule, action: { type: 'addClass', value: 'inventada' } }] }, ctx);
    expect(proposal()).toBeNull(); // erro: a proposta anterior deixa de valer
});

test('preview_rules com blocos selecionados: recusa operações e limita as regras', async () => {
    const parts = [chapter('Um', '<p>a</p><p>b</p>')];
    const { ctx, proposal } = setup(parts, {}, { chapter: 0, index: 3, texts: ['b'] });
    expect((await previewRulesTool.run({ rules: [], operations: [{ type: 'drop_caps' }] }, ctx)).is_error).toBe(true);
    await previewRulesTool.run({ rules: [{ select: { tag: ['p'] }, action: { type: 'addClass', value: 'p-center' } }] }, ctx);
    expect(proposal()?.reports[0].changed).toBe(1);
});

test('run_validation: um tipo, todos por ordem, ACE por omissão; uma que falha não impede as outras', async () => {
    const order: ValidationKind[] = [];
    const { ctx } = setup([], { validate: async (k: ValidationKind) => { order.push(k); return k === 'links' ? null : digest(k === 'epub' ? 2 : 0); } });
    const all = JSON.parse((await runValidationTool.run({ type: 'all' }, ctx)).content).validacoes;
    expect(order).toEqual(['footnotes', 'links', 'epub', 'accessibility']);
    expect(all.map((v: { ok: boolean; erro?: string }) => (v.erro ? 'erro' : v.ok ? 'ok' : 'problemas'))).toEqual(['ok', 'erro', 'problemas', 'ok']);
    order.length = 0;
    await runValidationTool.run({}, ctx);
    expect(order).toEqual(['accessibility']);
});

test('run_validation: se nenhuma correu (modo leitura) é erro para o modelo explicar', async () => {
    const { ctx } = setup();
    const r = await runValidationTool.run({ type: 'all' }, ctx);
    expect(r.is_error).toBe(true);
    expect(r.content).toContain('Não foi possível correr a validação');
});

test('check_publication: sem dados do livro é erro; com dados junta factos e validações', async () => {
    expect((await checkPublicationTool.run({}, setup().ctx)).is_error).toBe(true);
    const facts = { metadata: { title: 'T', author: 'A', language: 'pt', ebook_isbn: '1' }, hasCover: false, images: { total: 0, withoutAlt: 0 }, indice: { exists: false, linked: 0, linkable: 0 }, pageMarkers: 0 };
    const { ctx } = setup([], { publicationFacts: async () => facts, validate: async () => digest(0) });
    const items = JSON.parse((await checkPublicationTool.run({}, ctx)).content).itens as { item: string; estado: string }[];
    expect(items.find((i) => i.item === 'Capa')?.estado).toBe('falta');
    expect(items.filter((i) => ['Links', 'EPUBCheck'].includes(i.item)).every((i) => i.estado === 'ok')).toBe(true);
});

test('preview_rules com style_deletes: propõe apagar o que nada usa; em uso é erro e não há proposta', async () => {
    const css = '/* === ESTILOS PERSONALIZADOS === */\n    .p-velho { color: red; }\n    .p-usado { color: blue; }\n/* === EDITOR (não exportado para EPUB) === */\n';
    const { ctx, proposal } = setup([chapter('Um', '<p class="p-usado">a</p>')], {}, null, css);
    const ok = JSON.parse((await previewRulesTool.run({ rules: [], style_deletes: ['p-velho'] }, ctx)).content);
    expect(ok.errors).toEqual([]);
    expect(ok.style_deletes).toEqual(['p-velho']);
    expect(proposal()?.removals).toEqual(['p-velho']);
    const bad = JSON.parse((await previewRulesTool.run({ rules: [], style_deletes: ['p-usado'] }, ctx)).content);
    expect(bad.errors[0]).toContain('está em uso');
    expect(proposal()).toBeNull();
    expect((await previewRulesTool.run({ rules: [], style_deletes: 'p-velho' }, ctx)).is_error).toBe(true);
});

test('check_page_list: agrupa as páginas sem marcador pelo motivo', async () => {
    const audit = { pagesWithFolio: 10, marked: 7, withoutFolio: 2, missing: [{ page: 56, reason: 'branca' as const }, { page: 43, reason: 'figura' as const }, { page: 68, reason: 'fora-de-ordem' as const }], orphanMarkers: [4] };
    const { ctx } = setup([], { pageListAudit: async () => audit });
    const out = JSON.parse((await checkPageListTool.run({}, ctx)).content);
    expect(out.resumo).toEqual({ paginasComFolio: 10, comMarcador: 7, semMarcador: 3, paginasSemFolio: 2 });
    expect(Object.values(out.semMarcador)).toEqual([[56], [43], [68]]);
    expect(out.marcadoresSemPaginaNoPdf).toEqual([4]);
});

test('check_page_list: sem PDF devolve erro a dizer para o carregar', async () => {
    const { ctx } = setup();
    const out = await checkPageListTool.run({}, ctx);
    expect(out.is_error).toBe(true);
    expect(out.content).toContain('PDF');
});

test('preview_rules + fix_page_list: o resumo do PDF entra na operação; sem PDF é erro; aplica só os que cabem entre vizinhos', async () => {
    const body = '<p>Texto da pagina um que esta no livro com marcador <span class="pagebreak" data-page="1"></span></p><p>Texto da pagina dois que esta no livro sem marcador algum</p><p>Texto da pagina tres que esta no livro <span class="pagebreak" data-page="3"></span>com marcador</p>';
    const pages = [{ page: 2, lines: ['textodapaginadoisqueestano'] }];
    const semPdf = setup([chapter('Um', body)]);
    const erro = await previewRulesTool.run({ rules: [], operations: [{ type: 'fix_page_list' }] }, semPdf.ctx);
    expect(erro.is_error).toBe(true);
    expect(erro.content).toContain('PDF');

    const { ctx, proposal } = setup([chapter('Um', body)], { pageLines: async () => pages });
    const out = JSON.parse((await previewRulesTool.run({ rules: [], operations: [{ type: 'fix_page_list' }] }, ctx)).content);
    expect(out.errors).toEqual([]);
    expect(out.operations[0]).toMatchObject({ label: 'Lista de páginas', changed: true });
    expect(out.operations[0].summary).toContain('páginas 2');
    expect(proposal()!.ops[0]).toEqual({ type: 'fix_page_list', pages }); // a proposta leva os dados: aplicar repete o que se viu
});

// Um PDF de uma página com um parágrafo recuado (x0 77 contra a margem 60) em corpo de 11 pt.
const pdfRecuado: PdfStyles = { body: 11, pages: [{ left: 60, right: 360, gap: 14, lines: [{ key: 'textodetestecommaisdedozeletras', x0: 77, x1: 360, y: 600, size: 11, bold: false, italic: false }] }] };

test('check_styles: sem PDF é erro; com PDF agrupa as diferenças por tipo', async () => {
    expect((await checkStylesTool.run({}, setup().ctx)).is_error).toBe(true);
    const { ctx } = setup([chapter('Um', '<p>Texto de teste com mais de doze letras</p>')], { pdfStyles: async () => pdfRecuado });
    const out = JSON.parse((await checkStylesTool.run({}, ctx)).content);
    expect(out.resumo).toEqual({ paragrafosVistos: 1, encontradosNoPdf: 1, comDiferencas: 1 });
    expect(Object.keys(out.diferencas)[0]).toContain('indent');
    expect(Object.values(out.diferencas)[0]).toMatchObject({ add: ['p-indent'], total: 1 });
});

test('preview_rules + fix_styles: o PDF entra na operação; sem PDF é erro; kinds limita o que se corrige', async () => {
    const body = '<p>Texto de teste com mais de doze letras</p>';
    const erro = await previewRulesTool.run({ rules: [], operations: [{ type: 'fix_styles' }] }, setup([chapter('Um', body)]).ctx);
    expect(erro.is_error).toBe(true);
    expect(erro.content).toContain('PDF');

    const { ctx, proposal } = setup([chapter('Um', body)], { pdfStyles: async () => pdfRecuado });
    const out = JSON.parse((await previewRulesTool.run({ rules: [], operations: [{ type: 'fix_styles' }] }, ctx)).content);
    expect(out.errors).toEqual([]);
    expect(out.operations[0]).toMatchObject({ label: 'Estilos segundo o PDF', changed: true });
    expect(out.operations[0].summary).toContain('indentação 1');
    expect(proposal()!.ops[0]).toEqual({ type: 'fix_styles', pdf: pdfRecuado }); // a proposta leva os dados: aplicar repete o que se viu

    const so = JSON.parse((await previewRulesTool.run({ rules: [], operations: [{ type: 'fix_styles', kinds: ['center'] }] }, ctx)).content);
    expect(so.operations[0].changed).toBe(false);
    expect((await previewRulesTool.run({ rules: [], operations: [{ type: 'fix_styles', kinds: ['nada'] }] }, ctx)).content).toContain('kinds');
});

// 4 páginas com um parágrafo cada e a legenda da figura na 1.ª: no livro a figura está depois do último (3 páginas atrás do PDF).
const lin = (key: string, y: number) => ({ key, y, x0: 60, x1: 360, size: 11, bold: false, italic: false });
const pdfFigura: PdfStyles = { body: 11, pages: ['primeiroparagrafodolivro', 'segundoparagrafodolivro', 'terceiroparagrafodolivro', 'quartoparagrafodolivro'].map((k, i) => ({ left: 60, right: 360, gap: 14, lines: i ? [lin(k, 600)] : [lin(k, 600), lin('figura11legendadaprimeirafigura', 300)] })) };
const livroFigura = chapter('Um', ['Primeiro', 'Segundo', 'Terceiro', 'Quarto'].map((n) => `<p>${n} paragrafo do livro</p>`).join('') + '<img data-image-id="a" src="x" alt=""><p class="p-legendas">Figura 1.1 Legenda da primeira figura</p>');

test('check_figures: sem PDF é erro; com PDF lista a figura fora do sítio', async () => {
    expect((await checkFiguresTool.run({}, setup().ctx)).is_error).toBe(true);
    const { ctx } = setup([livroFigura], { pdfStyles: async () => pdfFigura });
    const out = JSON.parse((await checkFiguresTool.run({}, ctx)).content);
    expect(out.resumo).toEqual({ figuras: 1, comLegendaEncontradaNoPdf: 1, comDiferencas: 1 });
    expect(out.diferencas[0]).toMatchObject({ tipo: 'fora do sítio', paginaNoPdf: 1, corrigivel: true });
});

test('preview_rules + fix_figures: o PDF entra na operação e a figura vai para o sítio do PDF', async () => {
    const { ctx, proposal } = setup([livroFigura], { pdfStyles: async () => pdfFigura });
    const out = JSON.parse((await previewRulesTool.run({ rules: [], operations: [{ type: 'fix_figures' }] }, ctx)).content);
    expect(out.errors).toEqual([]);
    expect(out.operations[0]).toMatchObject({ label: 'Figuras segundo o PDF', changed: true, summary: '1 figura movida' });
    expect(proposal()!.ops[0]).toEqual({ type: 'fix_figures', pdf: pdfFigura });
    expect((await previewRulesTool.run({ rules: [], operations: [{ type: 'fix_figures' }] }, setup([livroFigura]).ctx)).is_error).toBe(true);
});

test('build_report: entrega o texto à interface com cada falha localizada; a resposta ao modelo só traz as contagens', async () => {
    const livro = chapter('Um', '<p>Primeiro paragrafo do livro</p><p>Segundo paragrafo do livro</p>');
    const { ctx, report } = setup([livro], {
        title: () => 'Livro X',
        pdfStyles: async () => ({ body: 11, pages: [{ left: 60, right: 360, gap: 14, lines: [{ key: 'primeiroparagrafodolivro', x0: 77, x1: 360, y: 600, size: 11, bold: false, italic: false }] }] }),
        validate: async (k: ValidationKind) => (k === 'links' ? { source: 's', valid: false, omittedGroups: 0, groups: [{ rule: 'link-partido', severity: 'erro' as const, count: 2, description: 'destino em falta', files: ['cap1.xhtml'], examples: ['<a href="#x">y</a>'] }] } : digest(0)),
    });
    const out = JSON.parse((await buildReportTool.run({}, ctx)).content);
    expect(out.pronto).toBe(true);
    expect(out.falhasPorSecao).toMatchObject({ estilos: 1, figuras: 0, validacoes: 2 });
    expect(out.naoFeito).toContain('publicação'); // memoryWorkspace não tem dados do livro
    const text = report()!;
    expect(text).toContain('RELATÓRIO DE FALHAS — Livro X');
    expect(text).toContain('[Um · PDF p. 1] "Primeiro paragrafo do livro"'); // capítulo, página e excerto
    expect(text).toContain('acrescentar .p-indent');
    expect(text).toContain('link-partido (2)');
    expect(text).toContain('Ficheiros: cap1.xhtml');
    expect(text).toContain('Exemplo: <a href="#x">y</a>');
    expect(text).toContain('LISTA DE PÁGINAS'); // sem PDF de lista de páginas: diz-o
});
