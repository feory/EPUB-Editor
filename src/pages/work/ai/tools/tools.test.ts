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
import { checkTextTool } from './checkText';
import { buildReportTool } from './buildReport';
import { findTextTool } from './findText';
import { compressImagesTool } from './compressImages';
import { searchDocsTool, searchDocs } from './searchDocs';
import type { PdfStyles } from '../../../../services/page-list/pdf-styles';
import { AI_TOOLS } from './index';
import { TOOL_SPECS } from '../../../../../shared/ai-contract.js';
import type { Proposal, Suggestion, ToolContext } from './aiTool';
import type { ValidationDigest, ValidationKind } from '../../../../utils/validation-digest';

const chapter = (title: string, body: string) => `<p class="chapter-break-h1" data-title="${title}"></p><h1>${title}</h1>${body}`;
const digest = (n: number): ValidationDigest => ({ source: 's', valid: !n, groups: n ? [{ rule: 'r', severity: 'aviso', count: n, description: '', files: [], examples: [] }] : [], omittedGroups: 0 });
const setup = (parts: string[] = [], over = {}, scope: ToolContext['scope'] = null, css = '') => {
    let proposal: Proposal | null = null;
    let report: string | null = null;
    const suggestions: Suggestion[] = [];
    const ctx: ToolContext = { workspace: memoryWorkspace({ parts, css }, over), scope, propose: (p) => { proposal = p; }, deliver: (r) => { report = r; }, suggest: (s) => { suggestions.push(s); } };
    return { ctx, proposal: () => proposal, report: () => report, suggestions };
};

test('o registo tem uma ferramenta por nome', () => {
    const names = AI_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(Object.keys(TOOL_SPECS).sort()); // o registo do cliente e a especificação partilhada têm as mesmas ferramentas
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
    expect(proposal()!.ops[0]).toEqual({ type: 'fix_styles', pdf: pdfRecuado, css: '' }); // a proposta leva os dados: aplicar repete o que se viu

    const so = JSON.parse((await previewRulesTool.run({ rules: [], operations: [{ type: 'fix_styles', kinds: ['center'] }] }, ctx)).content);
    expect(so.operations[0].changed).toBe(false);
    expect((await previewRulesTool.run({ rules: [], operations: [{ type: 'fix_styles', kinds: ['nada'] }] }, ctx)).content).toContain('kinds');
});

// 4 páginas com um parágrafo cada e a legenda da figura na 1.ª: no livro a figura está depois do último (3 páginas atrás do PDF).
const lin = (key: string, y: number) => ({ key, y, x0: 60, x1: 360, size: 11, bold: false, italic: false });
const pdfFigura: PdfStyles = { body: 11, pages: ['primeiroparagrafodolivro', 'segundoparagrafodolivro', 'terceiroparagrafodolivro', 'quartoparagrafodolivro'].map((k, i) => ({ left: 60, right: 360, gap: 14, lines: i ? [lin(k, 600)] : [lin(k, 600), lin('figura11legendadaprimeirafigura', 300)] })) };
const livroFigura = chapter('Um', ['Primeiro', 'Segundo', 'Terceiro', 'Quarto'].map((n) => `<p>${n} paragrafo do livro</p>`).join('') + '<img data-image-id="a" src="x" alt=""><p class="p-legendas">Figura 1.1 Legenda da primeira figura</p>');

test('check_text: sem PDF é erro; com PDF agrupa as linhas em falta por página e não mostra o ruído', async () => {
    expect((await checkTextTool.run({}, setup().ctx)).is_error).toBe(true);
    const textAudit = async () => ({ pdfLines: 40, bookBlocks: 10, missing: [{ page: 3, text: 'linha perdida um' }, { page: 3, text: 'linha perdida dois' }], extra: [{ chapter: 'Cap 1', text: 'só no livro' }], columnPages: [5, 6], columnBlocks: 2, figureText: [{ page: 8, text: 'texto de diagrama' }] });
    const out = JSON.parse((await checkTextTool.run({}, setup([], { textAudit }).ctx)).content);
    expect(out.resumo).toEqual({ linhasDoPdf: 40, linhasQueFaltamNoLivro: 2 });
    expect(out.faltaNoLivro).toEqual([{ paginaPdf: 3, linhas: 2, exemplos: ['linha perdida um', 'linha perdida dois'] }]);
    expect(Object.keys(out).sort()).toEqual(['faltaNoLivro', 'nota', 'paginasComFaltas', 'resumo']);
});

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

test('search_docs: acha a secção dos guias que responde à pergunta; sem assunto conhecido não inventa', async () => {
    expect(searchDocs('como partilho um livro com um colega')[0].title).toContain('Partilhar');
    expect(searchDocs('como faço uma nota de rodapé')[0].title).toContain('nota de rodapé');
    const hit = JSON.parse((await searchDocsTool.run({ query: 'como crio um estilo próprio?' }, setup().ctx)).content);
    expect(hit.secoes.length).toBeGreaterThan(0);
    expect(hit.secoes[0].texto).toContain('##');
    expect(JSON.parse((await searchDocsTool.run({ query: 'zzzqqq xyzxyz' }, setup().ctx)).content).secoes).toEqual([]);
    expect((await searchDocsTool.run({}, setup().ctx)).is_error).toBe(true);
});

test('find_text: acha o texto sem acentos nem maiúsculas, com capítulo, posição, tipo e excerto; diz se o bloco começa por ele', () => {
    const { ctx } = setup([
        chapter('Preços', '<p class="p-bold">Nota importante: os preços incluem IVA.</p><p>Ver a nota IMPORTANTE na página seguinte, e outra nota importante.</p><p>nada</p>'),
        chapter('Promoções', '<p class="p-bold">Nota importante: as promoções não acumulam.</p>'),
    ]);
    const out = JSON.parse((findTextTool.run({ query: 'nota  importante' }, ctx) as { content: string }).content);
    expect(out).toMatchObject({ blocosEncontrados: 3, mostrados: 3 });
    expect(out.resultados.map((r: { capitulo: number; titulo: string; tipo: string; comecaPor: boolean; ocorrencias: number }) => [r.capitulo, r.titulo, r.tipo, r.comecaPor, r.ocorrencias]))
        .toEqual([[0, 'Preços', 'p.p-bold', true, 1], [0, 'Preços', 'p', false, 2], [1, 'Promoções', 'p.p-bold', true, 1]]);
    expect(out.resultados[0].excerto).toContain('Nota importante');
    const acc = JSON.parse((findTextTool.run({ query: 'PRECOS', chapters: [0] }, ctx) as { content: string }).content);
    expect(acc.resultados.map((r: { bloco: number }) => r.bloco)).toEqual([1, 2]); // o bloco 0 é o marcador de capítulo; o h1 é o 1 e o parágrafo com "preços" o 2
});

test('find_text: limita a 20 resultados (e diz quantos há), recusa queries curtas ou longas', () => {
    const { ctx } = setup([chapter('Um', Array.from({ length: 30 }, (_, i) => `<p>linha ${i} alvo</p>`).join(''))]);
    const out = JSON.parse((findTextTool.run({ query: 'alvo' }, ctx) as { content: string }).content);
    expect(out).toMatchObject({ blocosEncontrados: 30, mostrados: 20 });
    expect(JSON.parse((findTextTool.run({ query: 'alvo', limit: 3 }, ctx) as { content: string }).content).mostrados).toBe(3);
    expect(findTextTool.run({ query: 'a' }, ctx)).toMatchObject({ is_error: true });
    expect(findTextTool.run({ query: 'x'.repeat(121) }, ctx)).toMatchObject({ is_error: true });
    expect(JSON.parse((findTextTool.run({ query: 'inexistente' }, ctx) as { content: string }).content)).toMatchObject({ blocosEncontrados: 0, resultados: [] });
});

test('sugestões: as verificações com algo corrigível oferecem o passo seguinte; sem nada a corrigir, não', async () => {
    const labels = (r: { suggestions: Suggestion[] }) => r.suggestions.map((x) => x.label);
    const ordem = { pagesWithFolio: 3, marked: 1, withoutFolio: 0, orphanMarkers: [], missing: [{ page: 68, reason: 'fora-de-ordem' as const }] };
    const a = setup([], { pageListAudit: async () => ordem }); await checkPageListTool.run({}, a.ctx);
    expect(labels(a)).toEqual(['Corrigir lista de páginas']);
    expect(a.suggestions[0]).toMatchObject({ prompt: 'Corrige a lista de páginas', edits: true });
    const b = setup([], { pageListAudit: async () => ({ ...ordem, missing: [{ page: 56, reason: 'branca' as const }] }) }); await checkPageListTool.run({}, b.ctx);
    expect(b.suggestions).toEqual([]); // só as em branco/Índice/figura: normal, nada a corrigir

    const c = setup([chapter('Um', '<p>Texto de teste com mais de doze letras</p>')], { pdfStyles: async () => pdfRecuado }); await checkStylesTool.run({}, c.ctx);
    expect(labels(c)).toEqual(['Corrigir estilos pelo PDF']);
    const d = setup([livroFigura], { pdfStyles: async () => pdfFigura }); await checkFiguresTool.run({}, d.ctx);
    expect(labels(d)).toEqual(['Pôr as figuras no sítio']);

    const e = setup([], { validate: async () => digest(2) }); await runValidationTool.run({ type: 'epub' }, e.ctx);
    expect(labels(e)).toEqual(['Propor correções']);
    const f = setup([], { validate: async () => digest(0) }); await runValidationTool.run({ type: 'epub' }, f.ctx);
    expect(f.suggestions).toEqual([]);
});

test('compress_images: passa as opções ao editor e resume a poupança; em leitura ou se falhar é erro', async () => {
    let seen: unknown;
    const ok = setup([], { compressImages: async (o: unknown) => { seen = o; return { total: 10, compressed: 8, before: 20e6, after: 5e6, maxWidth: 1200, quality: 82 }; } });
    const out = JSON.parse((await compressImagesTool.run({ max_width: 1200 }, ok.ctx)).content);
    expect(seen).toEqual({ maxWidth: 1200, quality: undefined });
    expect(out).toMatchObject({ imagens: 10, comprimidas: 8, antes: '20.0 MB', depois: '5.0 MB', poupado: '75%' });

    expect((await compressImagesTool.run({}, setup([]).ctx)).is_error).toBe(true); // memoryWorkspace: falhou (null)
    expect((await compressImagesTool.run({}, setup([], { readOnly: () => true }).ctx)).is_error).toBe(true);
});
