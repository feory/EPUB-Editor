import { test, expect, afterAll } from 'bun:test';

process.env.JWT_SECRET ??= 'test-secret';
const { stmt } = await import('./database.js');
const { updateProfile } = await import('./routes/auth.js');

// database.js liga-se ao ebooks.db REAL: statements trocados por fakes em memória (ver trash.test.js).
const calls = [];
const FAKES = {
  setUserName: { run: (...a) => calls.push(a) },
  getUserById: { get: (id) => ({ id, email: 'a@x.pt', role: 'user', first_name: 'Ana', last_name: 'Silva', name: 'Ana Silva' }) },
};
const originals = Object.fromEntries(Object.keys(FAKES).map(k => [k, stmt[k]]));
Object.assign(stmt, FAKES);
afterAll(() => Object.assign(stmt, originals));

const put = (body) => new Request('http://x', { method: 'PUT', body: JSON.stringify(body) });

test('perfil: aparam-se os nomes, limitam-se a 60 e vazio guarda null (volta ao email)', async () => {
  calls.length = 0;
  const res = await updateProfile(put({ firstName: '  Ana ', lastName: 'x'.repeat(100) }), { sub: '4' });
  expect(res.status).toBe(200);
  expect(calls).toEqual([['Ana', 'x'.repeat(60), 4]]);
  calls.length = 0;
  await updateProfile(put({ firstName: '  ', lastName: 42 }), { sub: '4' });
  expect(calls).toEqual([[null, null, 4]]);
});
