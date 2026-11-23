// A política do pedido, testada pelo interface do router (um Request → uma Response), sem portas: autenticação, acesso ao ebook
// (dono / partilha / admin), bloqueio de escrita por presença e as exceções (GET público de capa e imagens, share, presence).
// Caracteriza o comportamento que já existia antes de o router sair de server/index.js.
import { test, expect } from 'bun:test';
import { SignJWT } from 'jose';
import { SECRET } from './middleware/auth.js';
import { stmt } from './database.js';
import { makeUser, makeEbook } from './test-helpers.js';

const { handleRequest } = await import('./router.js');

const token = (u) => new SignJWT({ sub: u.sub, role: u.role, email: u.email }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(SECRET);
const call = async (user, method, path, { client, body } = {}) => {
  const headers = {};
  if (user) headers.authorization = `Bearer ${await token(user)}`;
  if (client) headers['x-client-id'] = client;
  return handleRequest(new Request(`http://x${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
};

test('sem token, as rotas por-ebook respondem 401', async () => {
  const owner = makeUser();
  const isbn = makeEbook(owner);
  expect((await call(null, 'GET', `/api/ebooks/${isbn}`)).status).toBe(401);
});

test('GET de capa e de imagem é público (o <img> do browser não leva token); escrever não', async () => {
  const owner = makeUser();
  const isbn = makeEbook(owner);
  expect((await call(null, 'GET', `/api/ebooks/${isbn}/cover`)).status).not.toBe(401);
  expect((await call(null, 'GET', `/api/ebooks/${isbn}/images/foto`)).status).not.toBe(401);
  expect((await call(null, 'DELETE', `/api/ebooks/${isbn}/cover`)).status).toBe(401);
});

test('um segmento de ISBN inseguro é 404, mesmo no GET público', async () => {
  expect((await call(null, 'GET', '/api/ebooks/a%2F..%2Fb/cover')).status).toBe(404);
  const u = makeUser();
  expect((await call(u, 'GET', '/api/ebooks/..%2Fx')).status).toBe(404);
});

test('só o dono, o admin e quem recebeu a partilha veem o ebook; os outros recebem 404 (não 403)', async () => {
  const owner = makeUser(), other = makeUser(), admin = makeUser({ role: 'admin' }), friend = makeUser();
  const isbn = makeEbook(owner);
  expect((await call(owner, 'GET', `/api/ebooks/${isbn}`)).status).toBe(200);
  expect((await call(admin, 'GET', `/api/ebooks/${isbn}`)).status).toBe(200);
  expect((await call(other, 'GET', `/api/ebooks/${isbn}`)).status).toBe(404);
  expect((await call(owner, 'GET', '/api/ebooks/não-existe')).status).toBe(404);
  stmt.shareEbook.run(isbn, friend.id);
  expect((await call(friend, 'GET', `/api/ebooks/${isbn}`)).status).toBe(200);
  // quem recebeu a partilha não envia para a reciclagem (só dono/admin)
  expect((await call(friend, 'POST', `/api/trash/${isbn}/restore`)).status).toBe(404);
});

test('com alguém presente, só o detentor do lock escreve (409 locked); share e presence ficam de fora do lock', async () => {
  const owner = makeUser();
  const isbn = makeEbook(owner);
  const meta = { title: 'T' };

  expect((await call(owner, 'POST', `/api/ebooks/${isbn}/presence`, { client: 'A' })).status).toBe(200);
  // outra janela da MESMA conta: bloqueada
  const blocked = await call(owner, 'PUT', `/api/ebooks/${isbn}/metadata`, { client: 'B', body: meta });
  expect(blocked.status).toBe(409);
  expect((await blocked.json()).error).toBe('locked');
  // o detentor passa o guard (a resposta é a do handler, não 409)
  expect((await call(owner, 'PUT', `/api/ebooks/${isbn}/metadata`, { client: 'A', body: meta })).status).not.toBe(409);
  // exceções ao lock: partilhas e presença
  expect((await call(owner, 'POST', `/api/ebooks/${isbn}/share`, { client: 'B', body: {} })).status).not.toBe(409);
  expect((await call(owner, 'POST', `/api/ebooks/${isbn}/presence`, { client: 'B' })).status).toBe(200);
  // leituras nunca são bloqueadas
  expect((await call(owner, 'GET', `/api/ebooks/${isbn}`, { client: 'B' })).status).toBe(200);
});

test('sem ninguém presente não há lock', async () => {
  const owner = makeUser();
  const isbn = makeEbook(owner);
  expect((await call(owner, 'PUT', `/api/ebooks/${isbn}/metadata`, { client: 'solo', body: { title: 'T' } })).status).not.toBe(409);
});

test('reciclagem: restaurar exige poder apagar (dono/admin); quem não pode recebe 404', async () => {
  const owner = makeUser(), other = makeUser();
  const isbn = makeEbook(owner);
  expect((await call(other, 'POST', `/api/trash/${isbn}/restore`)).status).toBe(404);
  expect((await call(other, 'DELETE', `/api/trash/${isbn}`)).status).toBe(404);
  expect((await call(owner, 'POST', `/api/trash/${isbn}/restore`)).status).not.toBe(404);
});

test('rotas planas continuam a funcionar: lista de ebooks (com login), health (sem), e caminhos desconhecidos dão 404', async () => {
  const user = makeUser();
  expect((await call(user, 'GET', '/api/ebooks')).status).toBe(200);
  expect((await call(null, 'GET', '/api/ebooks')).status).toBe(401);
  expect((await call(null, 'GET', '/api/health')).status).toBe(200);
  const isbn = makeEbook(user);
  expect((await call(user, 'GET', `/api/ebooks/${isbn}/nao-existe`)).status).toBe(404);
  expect((await call(user, 'GET', `/api/ebooks/${isbn}/`)).status).toBe(404);
});

test('a tabela de rotas por-ebook: caminhos com parâmetros, imagens com segmento seguro e prefixo', async () => {
  const owner = makeUser();
  const isbn = makeEbook(owner);
  // imageId inseguro → 404 antes do handler; seguro e inexistente → o handler responde (não é o 404 da tabela)
  expect((await call(owner, 'GET', `/api/ebooks/${isbn}/images/a%20b`)).status).toBe(404);
  expect((await call(owner, 'GET', `/api/ebooks/${isbn}/images`)).status).toBe(200);
  expect((await call(owner, 'GET', `/api/ebooks/${isbn}/ai-changes`)).status).toBe(200);
});

test('relatório HTML: grava com login, abre sem token (só o último), com CSP; nomes inseguros são 404', async () => {
  const owner = makeUser();
  const isbn = makeEbook(owner);
  expect((await call(null, 'POST', `/api/ebooks/${isbn}/report`, { body: 'x' })).status).toBe(401);
  const save = async (html) => {
    const res = await handleRequest(new Request(`http://x/api/ebooks/${isbn}/report`, { method: 'POST', headers: { authorization: `Bearer ${await token(owner)}` }, body: html }));
    return (await res.json()).url;
  };
  const first = await save('<p>um</p>');
  const second = await save('<p>dois</p>');
  const open = await call(null, 'GET', second);
  expect(open.status).toBe(200);
  expect(await open.text()).toBe('<p>dois</p>');
  expect(open.headers.get('content-security-policy')).toContain("default-src 'none'");
  expect((await call(null, 'GET', first)).status).toBe(404);
  expect((await call(null, 'GET', `/api/ebooks/${isbn}/report/..%2Fcontent.html`)).status).toBe(404);
});
