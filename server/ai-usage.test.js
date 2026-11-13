import { test, expect, beforeEach } from 'bun:test';

process.env.JWT_SECRET ??= 'test-secret'; // config.js exige-o ao ser importado
const { recordAiUsage, usageReport } = await import('./ai-usage.js');
const { getUsage } = await import('./routes/ai-admin.js');
const { makeChat, makeAlt } = await import('./routes/ai.js');
const { openrouterBackend, fromOpenAiResponse } = await import('./ai-openrouter.js');
const { db } = await import('./database.js');
const { makeUser, post, uid } = await import('./test-helpers.js');

beforeEach(() => { db.run('DELETE FROM ai_usage'); });
const backend = { meta: { provider: 'openrouter', model: 'a/b' } };
const admin = { sub: '1', role: 'admin', email: 'a@t.pt' };

test('regista as contagens por chamada e agrega totais, por dia, utilizador, tipo e modelo', () => {
  const ana = makeUser({ email: `${uid('ana')}@t.pt` });
  recordAiUsage({ userId: ana.id, isbn: 'x', kind: 'chat', backend, usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 400, cost_usd: 0.0003 } });
  recordAiUsage({ userId: ana.id, isbn: 'x', kind: 'chat', backend, usage: { input_tokens: 500, output_tokens: 100 } }); // sem custo conhecido
  recordAiUsage({ userId: null, isbn: 'x', kind: 'alt', backend: { meta: { provider: 'anthropic', model: 'c/d' } }, usage: { input_tokens: 3400, output_tokens: 60 }, calls: 2 });
  const r = usageReport(30);
  expect(r.totals).toMatchObject({ calls: 4, input: 4900, output: 360, cached: 400, cost: 0.0003, costCalls: 1 });
  expect(r.byDay).toHaveLength(1);
  expect(r.byDay[0].input).toBe(4900);
  expect(r.byKind.map((k) => [k.kind, k.calls])).toEqual([['alt', 2], ['chat', 2]]);
  expect(r.byUser.find((u) => u.user === ana.email)).toMatchObject({ calls: 2, input: 1500 });
  expect(r.byUser.some((u) => u.user === 'removido')).toBe(true);
  expect(r.byModel.map((m) => m.model).sort()).toEqual(['a/b', 'c/d']);
});

test('janela de dias: linhas antigas ficam de fora; dias inválidos → 30 e máximo 365', () => {
  recordAiUsage({ userId: 1, kind: 'chat', backend, usage: { input_tokens: 10, output_tokens: 1 } });
  db.run("INSERT INTO ai_usage (kind, input_tokens, created_at) VALUES ('chat', 999, datetime('now', '-40 days'))");
  expect(usageReport(30).totals.input).toBe(10);
  expect(usageReport(90).totals.input).toBe(1009);
  expect(usageReport('lixo').days).toBe(30);
  expect(usageReport(99999).days).toBe(365);
  expect(usageReport(30).totals.cost).toBeNull(); // nada com custo → null, não 0
});

test('nunca lança: usage em falta, backend sem meta, BD a falhar', () => {
  expect(() => recordAiUsage({ userId: '5', kind: 'chat', backend: {}, usage: undefined })).not.toThrow();
  expect(usageReport(30).totals.calls).toBe(1);
  expect(() => recordAiUsage({ userId: 1, kind: null, backend, usage: {} })).not.toThrow(); // kind NOT NULL falha e é engolido
});

test('o painel: só administradores, com ?days', async () => {
  recordAiUsage({ userId: 1, kind: 'chat', backend, usage: { input_tokens: 7, output_tokens: 1 } });
  const url = (q) => new URL(`http://x/api/ai/usage${q}`);
  expect((await getUsage(url(''), { sub: '2', role: 'user', email: 'u@t.pt' })).status).toBe(403);
  const body = await getUsage(url('?days=7'), admin).json();
  expect(body.days).toBe(7);
  expect(body.totals.input).toBe(7);
});

test('o chat regista o consumo de cada chamada ao modelo (utilizador, livro, modelo); erro do fornecedor não regista', async () => {
  const ok = { create: async () => ({ content: [{ type: 'text', text: 'olá' }], stop_reason: 'end_turn', usage: { input_tokens: 123, output_tokens: 45, cost_usd: 0.001 } }), meta: backend.meta };
  const u = makeUser();
  await makeChat(ok)(post({ messages: [{ role: 'user', content: 'x' }] }), { sub: String(u.id), role: 'user', email: u.email }, 'isbn-1');
  const row = db.prepare('SELECT * FROM ai_usage').get();
  expect(row).toMatchObject({ user_id: u.id, ebook_isbn: 'isbn-1', kind: 'chat', provider: 'openrouter', model: 'a/b', calls: 1, input_tokens: 123, output_tokens: 45, cost_usd: 0.001 });
  const bad = { create: async () => { throw Object.assign(new Error('x'), { status: 500 }); }, meta: backend.meta };
  await makeChat(bad)(post({ messages: [{ role: 'user', content: 'x' }] }), { sub: String(u.id), role: 'user', email: u.email }, 'isbn-1');
  expect(db.prepare('SELECT COUNT(*) AS n FROM ai_usage').get().n).toBe(1);
});

test('o texto alternativo regista UMA linha por pedido, com a soma e o nº de imagens', async () => {
  const b = { meta: backend.meta, create: async () => ({ content: [{ type: 'text', text: '{"alt":"Barco","decorative":false}' }], usage: { input_tokens: 1700, output_tokens: 20, cost_usd: 0.0002 } }) };
  const run = makeAlt(b, async () => ({ data: 'QUJD', mediaType: 'image/jpeg' }));
  const u = makeUser();
  await run(post({ images: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], language: 'pt' }), 'isbn-2', { sub: String(u.id), role: 'user', email: u.email }); // o handler do texto alternativo recebe (req, isbn, user)
  const rows = db.prepare('SELECT * FROM ai_usage').all();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ kind: 'alt', calls: 3, input_tokens: 5100, output_tokens: 60 });
  expect(rows[0].cost_usd).toBeCloseTo(0.0006, 6);
});

test('OpenRouter: pede o custo (usage.include) e lê custo e tokens em cache da resposta', async () => {
  const bodies = [];
  const fetchImpl = async (_u, init) => { bodies.push(JSON.parse(init.body)); return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage: { prompt_tokens: 900, completion_tokens: 50, cost: 0.00042, prompt_tokens_details: { cached_tokens: 300 } } }); };
  const be = openrouterBackend({ apiKey: 'k', model: 'm', maxTokens: 10, fetchImpl });
  expect(be.meta).toEqual({ provider: 'openrouter', model: 'm' });
  const res = await be.create({ system: 's', tools: [], messages: [{ role: 'user', content: 'x' }] });
  expect(bodies[0].usage).toEqual({ include: true });
  expect(res.usage).toEqual({ input_tokens: 900, output_tokens: 50, cache_read_input_tokens: 300, cost_usd: 0.00042 });
  expect(fromOpenAiResponse({ choices: [{ finish_reason: 'stop', message: { content: 'x' } }], usage: {} }).usage).not.toHaveProperty('cost_usd'); // sem custo, não se inventa
});
