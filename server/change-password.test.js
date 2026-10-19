import { test, expect, afterAll } from 'bun:test';

process.env.JWT_SECRET ??= 'test-secret';
const { stmt } = await import('./database.js');
const { changePassword } = await import('./routes/auth.js');

// database.js liga-se ao ebooks.db REAL: statements trocados por fakes em memória (ver trash.test.js).
const OLD = 'palavra-passe-antiga-1';
const hash = await Bun.password.hash(OLD);
const calls = [];
const FAKES = {
  getPasswordHashById: { get: (id) => (id === 5 ? { password: hash } : undefined) },
  setPassword: { run: (h, id) => calls.push(['set', id, h !== hash]) },
  deleteUserTokens: { run: (id) => calls.push(['tokens', id]) },
  insertRefreshToken: { run: () => calls.push(['newToken']) },
  getUserById: { get: (id) => ({ id, email: 'a@x.pt', role: 'user' }) },
  insertActivityLog: { run: () => {} },
};
const originals = Object.fromEntries(Object.keys(FAKES).map(k => [k, stmt[k]]));
Object.assign(stmt, FAKES);
afterAll(() => Object.assign(stmt, originals));

const user = { sub: '5', email: 'a@x.pt', role: 'user' };
const req = (body) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` } });

test('palavra-passe: valida a atual, o tamanho e a diferença; só então muda', async () => {
  calls.length = 0;
  expect((await changePassword(req({ currentPassword: 'errada-errada-1', newPassword: 'nova-palavra-passe-9' }), user)).status).toBe(403);
  expect((await changePassword(req({ currentPassword: OLD, newPassword: 'curta' }), user)).status).toBe(400);
  expect((await changePassword(req({ currentPassword: OLD, newPassword: OLD }), user)).status).toBe(400);
  expect((await changePassword(req({ currentPassword: OLD }), user)).status).toBe(400);
  expect(calls).toEqual([]);
});

test('palavra-passe: sucesso muda o hash, termina as sessões e devolve uma nova', async () => {
  calls.length = 0;
  const res = await changePassword(req({ currentPassword: OLD, newPassword: 'nova-palavra-passe-9' }), user);
  expect(res.status).toBe(200);
  expect((await res.json()).accessToken).toBeTruthy();
  expect(res.headers.get('set-cookie')).toContain('=');
  expect(calls).toEqual([['set', 5, true], ['tokens', 5], ['newToken']]);
});
