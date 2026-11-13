import { test, expect } from 'bun:test';
import Anthropic from '@anthropic-ai/sdk';

process.env.JWT_SECRET ??= 'test-secret'; // config.js exige-o ao ser importado
const { makeChat: makeChatWith, makeAlt, anthropicBackend } = await import('./routes/ai.js');
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
  expect(p.tools.map((t) => t.name)).toEqual(['survey_book', 'preview_rules', 'run_validation']);
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
  expect(r.usage).toEqual({ input_tokens: 7, output_tokens: 3, cache_read_input_tokens: 0 });
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
  expect(sent.tools.map((t) => t.function.name)).toEqual(['survey_book', 'preview_rules', 'run_validation']);
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

// ---- Texto alternativo ----
const img = { data: 'QUJD', mediaType: 'image/jpeg' };
const altBackend = (impl) => { const calls = []; return { calls, create: async (p) => { calls.push(p); return impl(p, calls.length); } }; };
const reply = (text) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } });
const altReq = (images, language = 'pt') => post({ images, language });

test('alt: pedido de visão com a imagem, o contexto e a língua; devolve os textos por ordem', async () => {
  const b = altBackend((_p, n) => reply(n === 1 ? '{"alt":"Mapa da região norte","decorative":false}' : '```json\n{"alt":"","decorative":true}\n```'));
  const run = makeAlt(b, async () => img);
  const res = await run(altReq([{ id: 'mapa', chapter: 'Um', before: 'O mapa.', after: 'Figura 1' }, { id: 'orn' }], 'pt-PT'), 'isbn', user());
  const body = await res.json();
  expect(body.results).toEqual([{ id: 'mapa', alt: 'Mapa da região norte', decorative: false }, { id: 'orn', alt: '', decorative: true }]);
  expect(body.usage).toEqual({ input_tokens: 20, output_tokens: 10 });
  const p = b.calls[0];
  expect(p.tools).toEqual([]);
  expect(p.system).toContain('pt-PT');
  expect(p.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } });
  expect(p.messages[0].content[1].text).toContain('O mapa.');
});

test('alt: imagem em falta, resposta inválida e erro do fornecedor ficam por imagem, sem deitar o lote abaixo', async () => {
  const b = altBackend((_p, n) => { if (n === 1) return reply('não sei'); throw Object.assign(new Error('segredo interno'), { status: 500 }); });
  const run = makeAlt(b, async (_isbn, id) => (id === 'falta' ? null : img));
  const res = await run(altReq([{ id: 'falta' }, { id: 'a' }, { id: 'b' }]), 'isbn', user());
  const { results } = await res.json();
  expect(results.map((r) => r.error)).toEqual(['Imagem não encontrada', 'Resposta inválida do modelo', 'Erro da IA']);
  expect(JSON.stringify(results)).not.toContain('segredo');
});

test('alt: texto do modelo é limpo (sem tags nem < >, até 300) e texto vazio não conta como alt', async () => {
  const run = makeAlt(altBackend(() => reply('{"alt":"<b>Barco</b> no rio","decorative":false}')), async () => img);
  expect((await (await run(altReq([{ id: 'a' }]), 'i', user())).json()).results[0].alt).toBe('Barco no rio');
  const empty = makeAlt(altBackend(() => reply('{"alt":"  ","decorative":false}')), async () => img);
  expect((await (await empty(altReq([{ id: 'a' }]), 'i', user())).json()).results[0].error).toBe('Resposta inválida do modelo');
});

test('alt: validação do pedido (ids, tamanho do lote) e sem IA configurada', async () => {
  const run = makeAlt(altBackend(() => reply('{}')), async () => img);
  for (const images of [[], [{ id: '../x' }], [{ id: 5 }], Array.from({ length: 11 }, (_, i) => ({ id: `i${i}` }))]) {
    expect((await run(altReq(images), 'i', user())).status).toBe(400);
  }
  expect((await makeAlt(null)(altReq([{ id: 'a' }]), 'i', user())).status).toBe(503);
});

test('openrouter: imagem do utilizador vira image_url (data URI) e sem ferramentas não envia "tools"', async () => {
  const calls = [];
  const fetchImpl = async (_u, init) => { calls.push(JSON.parse(init.body)); return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"alt":"x"}' } }], usage: {} }); };
  const backend = openrouterBackend({ apiKey: 'k', model: 'm', maxTokens: 10, fetchImpl });
  await backend.create({ system: 'S', tools: [], messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }, { type: 'text', text: 'ctx' }] }] });
  expect(calls[0]).not.toHaveProperty('tools');
  expect(calls[0].messages[1].content).toEqual([{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }, { type: 'text', text: 'ctx' }]);
});

test('o prompt de sistema explica a nota de Aplicar e como reverter', async () => {
  const c = fakeClient(ok);
  await makeChat(c)(post({ messages: msgs }), user());
  const sys = c.calls[0].system[0].text;
  expect(sys).toContain('APLICOU');
  expect(sys).toContain('Nunca digas que "nada foi aplicado"');
  expect(sys).toContain('Antes de IA');
});
