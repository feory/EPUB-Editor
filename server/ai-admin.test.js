import { test, expect, afterEach } from 'bun:test';

process.env.JWT_SECRET ??= 'test-secret'; // config.js exige-o ao ser importado
const { encrypt, decrypt, saveAiSettings, publicAiSettings, effectiveOpenRouter } = await import('./ai-settings.js');
const { getSettings, putSettings, listModels, testConnection, toModelList, resetModelsCache } = await import('./routes/ai-admin.js');
const { resolveBackend } = await import('./routes/ai.js');
const { db } = await import('./database.js');
const { post, put } = await import('./test-helpers.js');

const admin = { sub: '1', role: 'admin', email: 'a@t.pt' };
const user = { sub: '2', role: 'user', email: 'u@t.pt' };
const KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef';

afterEach(() => { saveAiSettings({ clearKey: true, model: '' }); resetModelsCache(); });

test('cifra: ida e volta; texto cifrado não contém a chave; adulterado → null', () => {
  const blob = encrypt(KEY);
  expect(decrypt(blob)).toBe(KEY);
  expect(Buffer.from(blob, 'base64').toString('latin1')).not.toContain('sk-or');
  expect(encrypt(KEY)).not.toBe(blob); // iv novo de cada vez
  const raw = Buffer.from(blob, 'base64'); raw[raw.length - 1] ^= 1;
  expect(decrypt(raw.toString('base64'))).toBeNull();
});

test('guardar: a BD tem a chave cifrada, o Painel só vê os últimos 4 caracteres', () => {
  saveAiSettings({ apiKey: KEY, model: 'openai/gpt-6-luna' });
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'ai_openrouter_key'").get().value;
  expect(stored).not.toContain(KEY);
  const pub = publicAiSettings();
  expect(pub).toEqual({ configured: true, keyConfigured: true, keyHint: KEY.slice(-4), model: 'openai/gpt-6-luna' });
  expect(JSON.stringify(pub)).not.toContain(KEY);
  expect(effectiveOpenRouter().apiKey).toBe(KEY);
});

test('remover a chave e o modelo do Painel', () => {
  saveAiSettings({ apiKey: KEY, model: 'm/x' });
  saveAiSettings({ clearKey: true, model: '' });
  expect(publicAiSettings()).toMatchObject({ configured: false, keyConfigured: false, keyHint: null });
});

test('PUT: só administradores; valida chave e modelo; resposta nunca traz a chave', async () => {
  expect((await putSettings(put({ model: 'a/b' }), user)).status).toBe(403);
  expect((await getSettings(user)).status).toBe(403);
  expect((await putSettings(put({ apiKey: 'curta' }), admin)).status).toBe(400);
  expect((await putSettings(put({ apiKey: 'a b c d e f g h i j k l m n o p q r s t' }), admin)).status).toBe(400);
  expect((await putSettings(put({ model: 'um modelo com espaços' }), admin)).status).toBe(400);
  const ok = await putSettings(put({ apiKey: `  ${KEY}  `, model: 'openai/gpt-6-luna' }), admin);
  expect(ok.status).toBe(200);
  expect(JSON.stringify(await ok.json())).not.toContain(KEY);
  expect(effectiveOpenRouter().apiKey).toBe(KEY); // aparada
  const cleared = await (await putSettings(put({ clearKey: true }), admin)).json();
  expect(cleared.keyConfigured).toBe(false);
});

const catalog = { data: [
  { id: 'b/vision', name: 'B Vision', context_length: 1000, pricing: { prompt: '0.0000001', completion: '0.0000005' }, architecture: { input_modalities: ['text', 'image'] }, supported_parameters: ['tools', 'temperature'] },
  { id: 'a/text', name: 'A Text', pricing: { prompt: '0.000002', completion: '0.00001' }, architecture: { input_modalities: ['text'] }, supported_parameters: ['tools'] },
  { id: 'c/notools', name: 'C No Tools', architecture: { input_modalities: ['text'] }, supported_parameters: ['temperature'] },
] };

test('lista de modelos: só os com ferramentas, ordenados por nome, com visão e preço por milhão', () => {
  const list = toModelList(catalog.data);
  expect(list.map((m) => m.id)).toEqual(['a/text', 'b/vision']);
  expect(list[1]).toMatchObject({ vision: true, contextLength: 1000, promptPerMillion: 0.1, completionPerMillion: 0.5 });
  expect(list[0]).toMatchObject({ vision: false, promptPerMillion: 2, completionPerMillion: 10 });
});

test('GET modelos: admin; vai buscar uma vez (cache); falha da OpenRouter → 502', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json(catalog); };
  expect((await listModels(user, fetchImpl)).status).toBe(403);
  const res = await listModels(admin, fetchImpl);
  expect((await res.json()).models).toHaveLength(2);
  await listModels(admin, fetchImpl);
  expect(calls).toBe(1);
  resetModelsCache();
  expect((await listModels(admin, async () => new Response('x', { status: 500 }))).status).toBe(502);
});

test('testar ligação: sem chave, chave recusada, modelo inexistente, modelo sem visão, tudo bem', async () => {
  const keyOk = (url, init) => (String(url).endsWith('/key') ? Response.json({ data: { label: 'x' } }) : Response.json(catalog));
  expect(await (await testConnection(admin, keyOk)).json()).toMatchObject({ ok: false, message: 'Não há chave configurada.' });

  saveAiSettings({ apiKey: KEY });
  const denied = async (url) => (String(url).endsWith('/key') ? new Response('no', { status: 401 }) : Response.json(catalog));
  expect((await (await testConnection(admin, denied)).json()).message).toContain('não aceita');
  expect((await (await testConnection(admin, keyOk)).json()).message).toContain('falta escolher o modelo');

  saveAiSettings({ model: 'nao/existe' });
  expect((await (await testConnection(admin, keyOk)).json()).message).toContain('"nao/existe" não existe');

  saveAiSettings({ model: 'a/text' });
  const noVision = await (await testConnection(admin, keyOk)).json();
  expect(noVision.ok).toBe(true);
  expect(noVision.message).toContain('não aceita imagens');

  saveAiSettings({ model: 'b/vision' });
  expect(await (await testConnection(admin, keyOk)).json()).toEqual({ ok: true, message: 'Ligação e modelo válidos.' });
  expect((await testConnection(user, keyOk)).status).toBe(403);
});

test('o fornecedor muda sem reiniciar: sem definições → nenhum; com chave+modelo do Painel → OpenRouter; outro modelo → outro backend', () => {
  const before = resolveBackend();
  saveAiSettings({ apiKey: KEY, model: 'a/text' });
  const a = resolveBackend();
  expect(a).not.toBeNull();
  expect(resolveBackend()).toBe(a); // mesma configuração = mesma instância
  saveAiSettings({ model: 'b/vision' });
  expect(resolveBackend()).not.toBe(a);
  saveAiSettings({ clearKey: true, model: '' });
  expect(resolveBackend()).toBe(before);
});

test('sem variáveis de ambiente para a OpenRouter: a chave e o modelo só vêm do Painel', async () => {
  const cfg = await import('./config.js');
  expect(cfg.OPENROUTER_API_KEY).toBeUndefined();
  expect(cfg.OPENROUTER_MODEL).toBeUndefined();
  expect(cfg.AI_PROVIDER).toBeUndefined();
  expect(effectiveOpenRouter()).toEqual({ apiKey: null, model: null });
});
