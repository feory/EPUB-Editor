import { test, expect } from 'bun:test';
import Anthropic from '@anthropic-ai/sdk';

process.env.JWT_SECRET ??= 'test-secret'; // config.js exige-o ao ser importado
const { makeChat: makeChatWith, anthropicBackend } = await import('./routes/ai.js');
const makeChat = (client) => makeChatWith(client && anthropicBackend(client));
const { uid, post } = await import('./test-helpers.js');

const user = () => ({ sub: uid('ai'), role: 'user', email: 'a@t.pt' });
const fakeClient = (impl) => {
  const calls = [];
  return { calls, beta: { messages: { create: async (p) => { calls.push(p); return impl(p); } } } };
};
const ok = () => ({ content: [{ type: 'text', text: 'olá' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
const msgs = [{ role: 'user', content: 'põe as citações mais pequenas' }];

test('sem chave configurada responde 503', async () => {
  const res = await makeChat(null)(post({ messages: msgs }), user());
  expect(res.status).toBe(503);
});

test('mensagens inválidas → 400 e a API não é chamada', async () => {
  const c = fakeClient(ok);
  const chat = makeChat(c);
  const bad = [
    [],
    [{ role: 'assistant', content: 'x' }],
    [{ role: 'system', content: 'x' }],
    [{ role: 'user', content: [{ type: 'image', source: {} }] }],
    [{ role: 'user', content: 'x'.repeat(600_000) }],
  ];
  for (const messages of bad) expect((await chat(post({ messages }), user())).status).toBe(400);
  expect((await chat(post({}), user())).status).toBe(400);
  expect(c.calls).toHaveLength(0);
});

test('pedido válido: modelo, sistema e ferramentas do servidor; sem tool_choice forçado nem amostragem', async () => {
  const c = fakeClient(ok);
  const res = await makeChat(c)(post({ messages: msgs, system: 'ignorado', tools: [], model: 'outro' }), user());
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ content: [{ type: 'text', text: 'olá' }], stop_reason: 'end_turn' });
  const p = c.calls[0];
  expect(p.model).toBe('claude-opus-5-5');
  expect(p.tools.map((t) => t.name)).toEqual(['survey_book', 'preview_rules']);
  expect(p.system[0].text).toContain('survey_book');
  expect(p.messages).toEqual(msgs);
  for (const k of ['tool_choice', 'temperature', 'top_p', 'top_k']) expect(p).not.toHaveProperty(k);
});

test('o ciclo de ferramentas passa: tool_use e tool_result são aceites', async () => {
  const c = fakeClient(ok);
  const messages = [
    ...msgs,
    { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 't1', name: 'survey_book', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"chapters":[]}' }] },
  ];
  expect((await makeChat(c)(post({ messages }), user())).status).toBe(200);
});

test('erro da API → 502 genérico (sem detalhes); 429 mantém-se', async () => {
  const boom = (status) => () => { throw new Anthropic.APIError(status, undefined, 'segredo interno', new Headers()); };
  const r500 = await makeChat(fakeClient(boom(500)))(post({ messages: msgs }), user());
  expect(r500.status).toBe(502);
  expect(JSON.stringify(await r500.json())).not.toContain('segredo');
  expect((await makeChat(fakeClient(boom(429)))(post({ messages: msgs }), user())).status).toBe(429);
});

test('limite por utilizador: o 61.º pedido leva 429 com Retry-After; outro utilizador não é afetado', async () => {
  const chat = makeChat(fakeClient(ok));
  const u = user();
  for (let i = 0; i < 60; i++) expect((await chat(post({ messages: msgs }), u)).status).toBe(200);
  const limited = await chat(post({ messages: msgs }), u);
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  expect((await chat(post({ messages: msgs }), user())).status).toBe(200);
});

// ---- OpenRouter ----
const { openrouterBackend, toOpenAiMessages, fromOpenAiResponse } = await import('./ai-openrouter.js');

test('openrouter: mensagens da Anthropic → chat completions (system, tool_calls, tool)', () => {
  const out = toOpenAiMessages('SYS', [
    { role: 'user', content: 'pedido' },
    { role: 'assistant', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'vou ver' }, { type: 'tool_use', id: 't1', name: 'survey_book', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"a":1}' }] },
  ]);
  expect(out).toEqual([
    { role: 'system', content: 'SYS' },
    { role: 'user', content: 'pedido' },
    { role: 'assistant', content: 'vou ver', tool_calls: [{ id: 't1', type: 'function', function: { name: 'survey_book', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 't1', content: '{"a":1}' },
  ]);
});

test('openrouter: resposta com tool_calls → blocos tool_use e stop_reason tool_use; JSON inválido → input {}', () => {
  const r = fromOpenAiResponse({
    choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [
      { id: 'a', function: { name: 'preview_rules', arguments: '{"rules":[]}' } },
      { id: 'b', function: { name: 'survey_book', arguments: '{mau' } },
    ] } }],
    usage: { prompt_tokens: 7, completion_tokens: 3 },
  });
  expect(r.stop_reason).toBe('tool_use');
  expect(r.content).toEqual([
    { type: 'tool_use', id: 'a', name: 'preview_rules', input: { rules: [] } },
    { type: 'tool_use', id: 'b', name: 'survey_book', input: {} },
  ]);
  expect(r.usage).toEqual({ input_tokens: 7, output_tokens: 3 });
});

test('openrouter: finish_reason mapeado (stop, length, content_filter)', () => {
  const map = (finish_reason) => fromOpenAiResponse({ choices: [{ finish_reason, message: { content: 'x' } }] }).stop_reason;
  expect([map('stop'), map('length'), map('content_filter')]).toEqual(['end_turn', 'max_tokens', 'refusal']);
});

test('openrouter: pedido ao endpoint com chave, modelo e ferramentas; resposta passa pelo handler', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'olá' } }], usage: {} }); };
  const chat = makeChatWith(openrouterBackend({ apiKey: 'sk-or-x', model: 'prov/modelo', maxTokens: 100, fetchImpl }));
  const res = await chat(post({ messages: msgs }), user());
  expect(await res.json()).toMatchObject({ content: [{ type: 'text', text: 'olá' }], stop_reason: 'end_turn' });
  expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
  expect(calls[0].init.headers.Authorization).toBe('Bearer sk-or-x');
  const sent = JSON.parse(calls[0].init.body);
  expect(sent.model).toBe('prov/modelo');
  expect(sent.tools.map((t) => t.function.name)).toEqual(['survey_book', 'preview_rules']);
  expect(sent.messages[0].role).toBe('system');
});

test('openrouter: erro HTTP → 502 sem detalhes (429 mantém-se); falha de rede → 502', async () => {
  const failing = (status) => makeChatWith(openrouterBackend({ apiKey: 'k', model: 'm', maxTokens: 1, fetchImpl: async () => new Response('segredo interno', { status }) }));
  const r500 = await failing(500)(post({ messages: msgs }), user());
  expect(r500.status).toBe(502);
  expect(JSON.stringify(await r500.json())).not.toContain('segredo');
  expect((await failing(429)(post({ messages: msgs }), user())).status).toBe(429);
  const down = makeChatWith(openrouterBackend({ apiKey: 'k', model: 'm', maxTokens: 1, fetchImpl: async () => { throw new TypeError('fetch failed'); } }));
  expect((await down(post({ messages: msgs }), user())).status).toBe(502);
});
