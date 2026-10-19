import { test, expect } from 'bun:test';
import { createHash } from 'crypto';
import { stmt } from './database.js';
import { changePassword } from './routes/auth.js';
import { makeUser, post } from './test-helpers.js';

// SQL real, base em memória (test-setup.js).
const OLD = 'palavra-passe-antiga-1';
const NEW = 'nova-palavra-passe-9';
const user = makeUser({ passwordHash: await Bun.password.hash(OLD) });
const req = (body) => new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
const hashOf = () => stmt.getPasswordHashById.get(user.id).password;

test('palavra-passe: valida a atual, o tamanho e a diferença; nada muda se falhar', async () => {
  const before = hashOf();
  expect((await changePassword(req({ currentPassword: 'errada-errada-1', newPassword: NEW }), user)).status).toBe(403);
  expect((await changePassword(req({ currentPassword: OLD, newPassword: 'curta' }), user)).status).toBe(400);
  expect((await changePassword(req({ currentPassword: OLD, newPassword: OLD }), user)).status).toBe(400);
  expect((await changePassword(req({ currentPassword: OLD }), user)).status).toBe(400);
  expect(hashOf()).toBe(before);
});

test('palavra-passe: sucesso muda o hash, termina as outras sessões e devolve uma nova', async () => {
  const oldSession = 'sessao-antiga';
  const hash = createHash('sha256').update(oldSession).digest('hex');
  stmt.insertRefreshToken.run(user.id, hash, '2099-01-01 00:00:00');
  expect(stmt.getRefreshToken.get(hash)).toBeTruthy();

  const res = await changePassword(req({ currentPassword: OLD, newPassword: NEW }), user);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.accessToken).toBeTruthy();
  expect(body.user.id).toBe(user.id);
  expect(res.headers.get('set-cookie')).toContain('=');
  expect(await Bun.password.verify(NEW, hashOf())).toBe(true);
  expect(await Bun.password.verify(OLD, hashOf())).toBe(false);
  expect(stmt.getRefreshToken.get(hash)).toBeFalsy(); // a sessão antiga terminou
});
