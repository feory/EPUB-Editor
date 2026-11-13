import { test, expect } from 'bun:test';
import '../../../services/indesign/happy-dom'; // DOMParser no bun
import { runAgent, type AgentMessage, type ChatResponse } from './aiAgent';
import { memoryWorkspace } from './testWorkspace';
import type { BookRule } from '../../../utils/book-rules';

const chapter = (title: string, body: string) => `<p class="chapter-break-h1" data-title="${title}"></p><h1>${title}</h1>${body}`;
const book = { parts: [chapter('Um', '<p>a</p><p>b</p>')], css: '' };
const ws = (b: { parts: string[]; css: string }) => memoryWorkspace(b);
// resultados de ferramentas da última mensagem enviada
const results = (m: AgentMessage[]) => m.at(-1)!.content as unknown as { content: string; is_error?: boolean }[];
const user: AgentMessage[] = [{ role: 'user', content: 'sem avanço no 1.º parágrafo' }];
const rule: BookRule = { select: { tag: ['p'], afterHeading: ['h1'] }, action: { type: 'addClass', value: 'p-non-indent' } };

const script = (...responses: ChatResponse[]) => {
    const seen: AgentMessage[][] = [];
    return { seen, send: async (m: AgentMessage[]) => { seen.push(m); return responses[seen.length - 1]; } };
};
const tool = (id: string, name: string, input = {}): ChatResponse => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] });
const text = (t: string): ChatResponse => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });

test('survey → preview → texto: devolve o texto final e a proposta', async () => {
    const s = script(tool('1', 'survey_book'), tool('2', 'preview_rules', { rules: [rule] }), text('1 parágrafo muda'));
    const r = await runAgent({ messages: user, send: s.send, workspace: ws(book) });
    expect(r.text).toBe('1 parágrafo muda');
    expect(r.proposal?.rules).toEqual([rule]);
    expect(r.proposal?.reports[0].changed).toBe(1);
    // o resultado do survey voltou ao modelo, com o capítulo
    const toolResult = results(s.seen[1])[0].content;
    expect(JSON.parse(toolResult).chapters[0].title).toBe('Um');
});

test('preview com erros: erro devolvido ao modelo, sem proposta', async () => {
    const bad: BookRule = { select: { tag: ['h2'] }, action: { type: 'delete' } };
    const s = script(tool('1', 'preview_rules', { rules: [bad] }), text('não dá'));
    const r = await runAgent({ messages: user, send: s.send, workspace: ws(book) });
    expect(r.proposal).toBeNull();
    expect(results(s.seen[1])[0].content).toContain('não se mexe em h1/h2');
});

test('preview que não muda nada (já aplicado) não gera proposta', async () => {
    const applied = { parts: [chapter('Um', '<p class="p-non-indent">a</p><p>b</p>')], css: '' };
    const r = await runAgent({ messages: user, send: script(tool('1', 'preview_rules', { rules: [rule] }), text('já está')).send, workspace: ws(applied) });
    expect(r.proposal).toBeNull();
});

test('a última simulação manda: um preview com erro depois de um válido anula a proposta', async () => {
    const bad: BookRule = { select: { tag: [] }, action: { type: 'delete' } };
    const s = script(tool('1', 'preview_rules', { rules: [rule] }), tool('2', 'preview_rules', { rules: [bad] }), text('x'));
    expect((await runAgent({ messages: user, send: s.send, workspace: ws(book) })).proposal).toBeNull();
});

test('ferramenta desconhecida e rules mal formadas → is_error', async () => {
    const s = script(tool('1', 'apagar_tudo'), tool('2', 'preview_rules', { rules: 'x' }), text('ok'));
    await runAgent({ messages: user, send: s.send, workspace: ws(book) });
    expect(results(s.seen[1])[0].is_error).toBe(true);
    expect(results(s.seen[2])[0].is_error).toBe(true);
});

test('recusa e limite de passos têm mensagem; o histórico inclui as respostas', async () => {
    const refused = await runAgent({ messages: user, send: async () => ({ stop_reason: 'refusal', content: [] }), workspace: ws(book) });
    expect(refused.text).toContain('recusou');
    const loop = await runAgent({ messages: user, send: async () => tool('x', 'survey_book'), workspace: ws(book) });
    expect(loop.text).toContain('limite de passos');
    expect(loop.messages.length).toBe(1 + 8 * 2);
});

const lastPreview = (s: ReturnType<typeof script>) => JSON.parse(results(s.seen[1])[0].content);

test('classe inventada é recusada na simulação (só editor + estilos do utilizador)', async () => {
    const fake: BookRule = { select: { tag: ['p'] }, action: { type: 'addClass', value: 'p-inventada' } };
    const s = script(tool('1', 'preview_rules', { rules: [fake] }), text('x'));
    const r = await runAgent({ messages: user, send: s.send, workspace: ws(book) });
    expect(r.proposal).toBeNull();
    expect(lastPreview(s).errors[0]).toContain('classe desconhecida "p-inventada"');
});

test('estilo novo + regra que o usa: proposta com os dois', async () => {
    const styles = [{ name: 'Nota início', props: { 'font-size': '0.9em', 'margin-left': '1.5em' } }];
    const use: BookRule = { select: { tag: ['p'], afterHeading: ['h1'] }, action: { type: 'addClass', value: 'nota-inicio' } };
    const s = script(tool('1', 'preview_rules', { styles, rules: [use] }), text('ok'));
    const r = await runAgent({ messages: user, send: s.send, workspace: ws(book) });
    expect(r.proposal?.styles).toEqual([{ cls: 'nota-inicio', body: 'font-size: 0.9em; margin-left: 1.5em;' }]);
    expect(r.proposal?.reports[0].changed).toBe(1);
});

test('estilo: propriedade fora da lista, valor perigoso, já existente ou classe do editor → erro e sem proposta', async () => {
    const css = '/* === ESTILOS PERSONALIZADOS === */\n    .ja-existe { color: red; }\n';
    const bad = [
        { name: 'a', props: { position: 'absolute' } },
        { name: 'b', props: { color: 'url(x)' } },
        { name: 'ja existe', props: { color: 'blue' } },
        { name: 'p-quote', props: { color: 'blue' } },
        { name: 'e', props: {} },
    ];
    const s = script(tool('1', 'preview_rules', { styles: bad, rules: [] }), text('x'));
    const r = await runAgent({ messages: user, send: s.send, workspace: ws({ ...book, css }) });
    expect(r.proposal).toBeNull();
    expect(lastPreview(s).errors).toHaveLength(5);
});

test('só estilos, sem regras: ainda é uma proposta', async () => {
    const s = script(tool('1', 'preview_rules', { styles: [{ name: 'Destaque', props: { 'font-style': 'italic' } }], rules: [] }), text('ok'));
    expect((await runAgent({ messages: user, send: s.send, workspace: ws(book) })).proposal?.styles).toHaveLength(1);
});

test('editar estilo existente: proposta com antes/depois; classe inexistente → erro', async () => {
    const css = '/* === ESTILOS DE PARÁGRAFO === */\n    .p-quote { font-size: 0.85em !important; }\n';
    const ok = script(tool('1', 'preview_rules', { rules: [], style_edits: [{ cls: 'p-quote', props: { 'font-size': '0.7em' } }] }), text('ok'));
    const r = await runAgent({ messages: user, send: ok.send, workspace: ws({ ...book, css }) });
    expect(r.proposal?.edits[0]).toMatchObject({ cls: 'p-quote', before: 'font-size: 0.85em !important;', after: 'font-size: 0.7em !important;' });
    const bad = script(tool('1', 'preview_rules', { rules: [], style_edits: [{ cls: 'xx', props: { color: 'red' } }] }), text('x'));
    expect((await runAgent({ messages: user, send: bad.send, workspace: ws({ ...book, css }) })).proposal).toBeNull();
});

test('operações: simuladas na proposta (sem alterar o livro) e erros voltam ao modelo', async () => {
    const ok = script(tool('1', 'preview_rules', { rules: [], operations: [{ type: 'drop_caps' }] }), text('ok'));
    const r = await runAgent({ messages: user, send: ok.send, workspace: ws(book) });
    expect(r.proposal?.ops).toEqual([{ type: 'drop_caps' }]);
    expect(r.proposal?.opResults[0]).toMatchObject({ label: 'Capitulares', changed: true });
    expect(book.parts[0]).not.toContain('drop-cap'); // a simulação não toca no livro
    const bad = script(tool('1', 'preview_rules', { rules: [], operations: [{ type: 'rename_chapter', index: 9, title: 'x' }] }), text('x'));
    expect((await runAgent({ messages: user, send: bad.send, workspace: ws(book) })).proposal).toBeNull();
    const notList = script(tool('1', 'preview_rules', { rules: [], operations: 'x' }), text('x'));
    await runAgent({ messages: user, send: notList.send, workspace: ws(book) });
    expect(notList.seen[1].at(-1)!.content).toBeDefined();
});

test('notas depois de Aplicar/Descartar: o modelo fica a saber, com o resumo para poder reverter', async () => {
    const { appliedNote, discardedNote } = await import('./aiAgent');
    const styles = [{ name: 'Nota', props: { 'font-size': '0.9em' } }];
    const css = '/* === ESTILOS DE PARÁGRAFO === */\n    .p-quote { font-size: 0.85em !important; }\n';
    const s = script(tool('1', 'preview_rules', { rules: [rule], styles, style_edits: [{ cls: 'p-quote', props: { 'font-size': '0.7em' } }] }), text('ok'));
    const r = await runAgent({ messages: user, send: s.send, workspace: ws({ ...book, css }) });
    const note = appliedNote(r.proposal!);
    expect(note.role).toBe('user');
    expect(note.content).toContain('APLICOU');
    expect(note.content).toContain('"antes":"font-size: 0.85em !important;"');
    expect(note.content).toContain('p-non-indent');
    expect(note.content).toContain('"blocos_alterados":1');
    expect(discardedNote().content).toContain('DESCARTOU');
});

test('converter o span inline em estilo de caracteres e aplicar nos h1 (estilo novo + operação, numa proposta)', async () => {
    const BADGE = 'background: #000; color: #fff; padding: 0.15em 0.6em;';
    const ch1 = (t: string) => `<p class="chapter-break-h1" data-title="${t}"></p><h1>Capítulo <span style="${BADGE}">1</span></h1><p>corpo <span style="${BADGE}">igual</span></p>`;
    const props = { background: '#000', color: '#fff', padding: '0.15em 0.6em' };
    const s = script(
        tool('1', 'survey_book'),
        tool('2', 'preview_rules', { rules: [], styles: [{ name: 'Número', kind: 'char', props }], operations: [{ type: 'inline_style_to_class', style: props, cls: 'c-numero', scope: ['h1'] }] }),
        text('ok'),
    );
    const r = await runAgent({ messages: user, send: s.send, workspace: ws({ parts: [ch1('Um'), ch1('Dois')], css: '' }) });
    const survey = JSON.parse(results(s.seen[1])[0].content);
    expect(survey.inlineSpans[0]).toMatchObject({ count: 4, inBlocks: { h1: 2, p: 2 } });
    expect(r.proposal?.styles).toEqual([{ cls: 'c-numero', body: 'background: #000; color: #fff; padding: 0.15em 0.6em;' }]);
    expect(r.proposal?.opResults[0]).toMatchObject({ label: 'Estilo inline → classe', changed: true, summary: '2 spans passam a .c-numero (em h1)' });
});

test('converter para uma classe que não existe (sem o estilo na proposta) → erro, sem proposta', async () => {
    const part = `<p class="chapter-break-h1" data-title="Um"></p><h1><span style="color: red;">1</span></h1>`;
    const s = script(tool('1', 'preview_rules', { rules: [], operations: [{ type: 'inline_style_to_class', style: { color: 'red' }, cls: 'c-vermelho' }] }), text('x'));
    const r = await runAgent({ messages: user, send: s.send, workspace: ws({ parts: [part], css: '' }) });
    expect(r.proposal).toBeNull();
    expect(results(s.seen[1])[0].content).toContain('não existe');
});

test('mudar o nome de um estilo novo: troca a classe no estilo, nas regras e nas operações, e refaz a simulação', async () => {
    const { renameProposalStyle } = await import('./aiAgent');
    const part = `<p class="chapter-break-h1" data-title="Um"></p><h1>Um <span style="color: red;">1</span></h1><p>corpo</p>`;
    const props = { color: 'red' };
    const use: BookRule = { select: { tag: ['p'] }, action: { type: 'addClass', value: 'c-vermelho' } };
    const s = script(tool('1', 'preview_rules', { rules: [use], styles: [{ name: 'Vermelho', kind: 'char', props }], operations: [{ type: 'inline_style_to_class', style: props, cls: 'c-vermelho', scope: ['h1'] }] }), text('ok'));
    const bookIn = { parts: [part], css: '' };
    const r = await runAgent({ messages: user, send: s.send, workspace: ws(bookIn) });
    const res = renameProposalStyle(r.proposal!, 'c-vermelho', 'Destaque forte', bookIn);
    if ('error' in res) throw new Error(res.error);
    const p = res.proposal;
    expect(p.styles).toEqual([{ cls: 'c-destaque-forte', body: 'color: red;' }]);
    expect((p.rules[0].action as { value: string }).value).toBe('c-destaque-forte');
    expect(p.ops[0]).toMatchObject({ type: 'inline_style_to_class', cls: 'c-destaque-forte' });
    expect(p.opResults[0].summary).toContain('.c-destaque-forte');
    expect(p.reports[0].samples[0].after).toContain('c-destaque-forte');
    // erros: nome vazio, classe já existente (do editor ou do livro) e estilo que já não consta
    expect('error' in renameProposalStyle(p, 'c-destaque-forte', '  !! ', bookIn)).toBe(true);
    expect('error' in renameProposalStyle(p, 'c-destaque-forte', 'p-quote', { ...bookIn, css: '/* === ESTILOS PERSONALIZADOS === */\n    .p-quote2 { color: red; }\n' })).toBe(false); // c-p-quote é livre
    const withExisting = { ...bookIn, css: '/* === ESTILOS PERSONALIZADOS === */\n    .c-existente { color: blue; }\n' };
    expect(renameProposalStyle(p, 'c-destaque-forte', 'existente', withExisting)).toEqual({ error: 'Já existe um estilo ".c-existente".' });
    expect('error' in renameProposalStyle(p, 'c-nao-esta', 'x', bookIn)).toBe(true);
    expect(renameProposalStyle(p, 'c-destaque-forte', 'destaque forte', bookIn)).toEqual({ proposal: p }); // mesmo nome = nada a fazer
});

test('resumo para o registo: regras com efeito, operações, estilos novos e estilos alterados (antes → depois)', async () => {
    const { summarizeProposal } = await import('./aiAgent');
    const css = '/* === ESTILOS DE PARÁGRAFO === */\n    .p-quote { font-size: 0.85em !important; }\n';
    const noop: BookRule = { select: { tag: ['p'], hasClass: ['nao-existe'] }, action: { type: 'addClass', value: 'p-small' } };
    const s = script(tool('1', 'preview_rules', { rules: [rule, noop], operations: [{ type: 'drop_caps' }], styles: [{ name: 'Nota', props: { 'font-size': '0.9em' } }], style_edits: [{ cls: 'p-quote', props: { 'font-size': '0.7em' } }] }), text('ok'));
    const r = await runAgent({ messages: user, send: s.send, workspace: ws({ ...book, css }) });
    const lines = summarizeProposal(r.proposal!);
    expect(lines).toContain('Regra 1: 1 bloco em 1 capítulo');
    expect(lines.some((l) => l.startsWith('Regra 2'))).toBe(false); // sem efeito não entra
    expect(lines.some((l) => l.startsWith('Capitulares:'))).toBe(true);
    expect(lines).toContain('Estilo novo .nota { font-size: 0.9em; }');
    expect(lines).toContain('Estilo .p-quote: font-size: 0.85em !important; → font-size: 0.7em !important;');
});

test('as ferramentas leem o livro na hora de cada chamada, não uma cópia tirada ao enviar o pedido', async () => {
    const w = memoryWorkspace({ parts: [chapter('Um', '<p>a</p>')] });
    const seen: number[] = [];
    let turn = 0;
    const send = async (m: AgentMessage[]): Promise<ChatResponse> => {
        turn++;
        if (turn === 2) seen.push(JSON.parse(results(m)[0].content).blocks.find((b: { key: string }) => b.key === 'p').count);
        if (turn === 1) { return tool('1', 'survey_book'); }
        if (turn === 2) { w.book.parts = [chapter('Um', '<p>a</p><p>b</p><p>c</p>')]; return tool('2', 'survey_book'); } // o livro muda a meio (alteração aplicada)
        seen.push(JSON.parse(results(m)[0].content).blocks.find((b: { key: string }) => b.key === 'p').count);
        return text('ok');
    };
    await runAgent({ messages: user, send, workspace: w });
    expect(seen).toEqual([1, 3]);
});
