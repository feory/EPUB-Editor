import { test, expect } from 'bun:test';
import '../../../services/indesign/happy-dom'; // DOMParser no bun
import { runAgent, type AgentMessage, type ChatResponse } from './aiAgent';
import type { BookRule } from '../../../utils/book-rules';

const chapter = (title: string, body: string) => `<p class="chapter-break-h1" data-title="${title}"></p><h1>${title}</h1>${body}`;
const book = { parts: [chapter('Um', '<p>a</p><p>b</p>')], css: '' };
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
    const r = await runAgent({ messages: user, send: s.send, book });
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
    const r = await runAgent({ messages: user, send: s.send, book });
    expect(r.proposal).toBeNull();
    expect(results(s.seen[1])[0].content).toContain('não se mexe em h1/h2');
});

test('preview que não muda nada (já aplicado) não gera proposta', async () => {
    const applied = { parts: [chapter('Um', '<p class="p-non-indent">a</p><p>b</p>')], css: '' };
    const r = await runAgent({ messages: user, send: script(tool('1', 'preview_rules', { rules: [rule] }), text('já está')).send, book: applied });
    expect(r.proposal).toBeNull();
});

test('a última simulação manda: um preview com erro depois de um válido anula a proposta', async () => {
    const bad: BookRule = { select: { tag: [] }, action: { type: 'delete' } };
    const s = script(tool('1', 'preview_rules', { rules: [rule] }), tool('2', 'preview_rules', { rules: [bad] }), text('x'));
    expect((await runAgent({ messages: user, send: s.send, book })).proposal).toBeNull();
});

test('ferramenta desconhecida e rules mal formadas → is_error', async () => {
    const s = script(tool('1', 'apagar_tudo'), tool('2', 'preview_rules', { rules: 'x' }), text('ok'));
    await runAgent({ messages: user, send: s.send, book });
    expect(results(s.seen[1])[0].is_error).toBe(true);
    expect(results(s.seen[2])[0].is_error).toBe(true);
});

test('recusa e limite de passos têm mensagem; o histórico inclui as respostas', async () => {
    const refused = await runAgent({ messages: user, send: async () => ({ stop_reason: 'refusal', content: [] }), book });
    expect(refused.text).toContain('recusou');
    const loop = await runAgent({ messages: user, send: async () => tool('x', 'survey_book'), book });
    expect(loop.text).toContain('limite de passos');
    expect(loop.messages.length).toBe(1 + 8 * 2);
});

const lastPreview = (s: ReturnType<typeof script>) => JSON.parse(results(s.seen[1])[0].content);

test('classe inventada é recusada na simulação (só editor + estilos do utilizador)', async () => {
    const fake: BookRule = { select: { tag: ['p'] }, action: { type: 'addClass', value: 'p-inventada' } };
    const s = script(tool('1', 'preview_rules', { rules: [fake] }), text('x'));
    const r = await runAgent({ messages: user, send: s.send, book });
    expect(r.proposal).toBeNull();
    expect(lastPreview(s).errors[0]).toContain('classe desconhecida "p-inventada"');
});

test('estilo novo + regra que o usa: proposta com os dois', async () => {
    const styles = [{ name: 'Nota início', props: { 'font-size': '0.9em', 'margin-left': '1.5em' } }];
    const use: BookRule = { select: { tag: ['p'], afterHeading: ['h1'] }, action: { type: 'addClass', value: 'nota-inicio' } };
    const s = script(tool('1', 'preview_rules', { styles, rules: [use] }), text('ok'));
    const r = await runAgent({ messages: user, send: s.send, book });
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
    const r = await runAgent({ messages: user, send: s.send, book: { ...book, css } });
    expect(r.proposal).toBeNull();
    expect(lastPreview(s).errors).toHaveLength(5);
});

test('só estilos, sem regras: ainda é uma proposta', async () => {
    const s = script(tool('1', 'preview_rules', { styles: [{ name: 'Destaque', props: { 'font-style': 'italic' } }], rules: [] }), text('ok'));
    expect((await runAgent({ messages: user, send: s.send, book })).proposal?.styles).toHaveLength(1);
});

test('editar estilo existente: proposta com antes/depois; classe inexistente → erro', async () => {
    const css = '/* === ESTILOS DE PARÁGRAFO === */\n    .p-quote { font-size: 0.85em !important; }\n';
    const ok = script(tool('1', 'preview_rules', { rules: [], style_edits: [{ cls: 'p-quote', props: { 'font-size': '0.7em' } }] }), text('ok'));
    const r = await runAgent({ messages: user, send: ok.send, book: { ...book, css } });
    expect(r.proposal?.edits[0]).toMatchObject({ cls: 'p-quote', before: 'font-size: 0.85em !important;', after: 'font-size: 0.7em !important;' });
    const bad = script(tool('1', 'preview_rules', { rules: [], style_edits: [{ cls: 'xx', props: { color: 'red' } }] }), text('x'));
    expect((await runAgent({ messages: user, send: bad.send, book: { ...book, css } })).proposal).toBeNull();
});

test('operações: simuladas na proposta (sem alterar o livro) e erros voltam ao modelo', async () => {
    const ok = script(tool('1', 'preview_rules', { rules: [], operations: [{ type: 'drop_caps' }] }), text('ok'));
    const r = await runAgent({ messages: user, send: ok.send, book });
    expect(r.proposal?.ops).toEqual([{ type: 'drop_caps' }]);
    expect(r.proposal?.opResults[0]).toMatchObject({ label: 'Capitulares', changed: true });
    expect(book.parts[0]).not.toContain('drop-cap'); // a simulação não toca no livro
    const bad = script(tool('1', 'preview_rules', { rules: [], operations: [{ type: 'rename_chapter', index: 9, title: 'x' }] }), text('x'));
    expect((await runAgent({ messages: user, send: bad.send, book })).proposal).toBeNull();
    const notList = script(tool('1', 'preview_rules', { rules: [], operations: 'x' }), text('x'));
    await runAgent({ messages: user, send: notList.send, book });
    expect(notList.seen[1].at(-1)!.content).toBeDefined();
});
