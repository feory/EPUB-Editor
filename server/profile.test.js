import { test, expect } from 'bun:test';
import { stmt } from './database.js';
import { updateProfile } from './routes/auth.js';
import { makeUser, put } from './test-helpers.js';

// SQL real, base em memória (test-setup.js).
test('perfil: aparam-se os nomes, limitam-se a 60 e o nome a mostrar vem do SQL', async () => {
  const u = makeUser();
  const res = await updateProfile(put({ firstName: '  Ana ', lastName: 'x'.repeat(100) }), u);
  expect(res.status).toBe(200);
  const row = stmt.getUserById.get(u.id);
  expect(row.first_name).toBe('Ana');
  expect(row.last_name).toBe('x'.repeat(60));
  expect(row.name).toBe(`Ana ${'x'.repeat(60)}`);
});

test('perfil: vazio guarda null e o nome a mostrar volta ao email', async () => {
  const u = makeUser({ first: 'Ana', last: 'Silva' });
  expect(stmt.getUserById.get(u.id).name).toBe('Ana Silva');
  await updateProfile(put({ firstName: '  ', lastName: 42 }), u);
  const row = stmt.getUserById.get(u.id);
  expect(row.first_name).toBeNull();
  expect(row.name).toBe(u.email);
});

test('nome a mostrar: só o nome, só o apelido, ambos', () => {
  expect(stmt.getUserById.get(makeUser({ first: 'Ana' }).id).name).toBe('Ana');
  expect(stmt.getUserById.get(makeUser({ last: 'Silva' }).id).name).toBe('Silva');
});
