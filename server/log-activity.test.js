import { test, expect } from 'bun:test';

// ponytail: log-activity.js importa database.js estaticamente (mesmo a função pura
// buildActivityLogRow não usando `stmt`), que por sua vez exige JWT_SECRET em config.js.
// Import dinâmico depois de definir um valor dummy evita ter de configurar env real só para
// testar uma função pura.
Bun.env.JWT_SECRET ??= 'test-secret';
const { buildActivityLogRow } = await import('./log-activity.js');

test('buildActivityLogRow: serializa meta em JSON e aceita actor nulo (login_failed)', () => {
  const row = buildActivityLogRow({ userId: null, userEmail: 'x@x.com' }, 'login_failed', { meta: { reason: 'wrong_password' } });
  expect(row.userId).toBeNull();
  expect(row.userEmail).toBe('x@x.com');
  expect(row.action).toBe('login_failed');
  expect(JSON.parse(row.meta)).toEqual({ reason: 'wrong_password' });
});

test('buildActivityLogRow: sem meta/target/req dá nulls, não "undefined"', () => {
  const row = buildActivityLogRow({ userId: 1, userEmail: 'a@a.com' }, 'user_create');
  expect(row.target).toBeNull();
  expect(row.meta).toBeNull();
  expect(row.ip).toBeNull();
});

test('buildActivityLogRow: extrai IP do primeiro valor de x-forwarded-for', () => {
  const req = { headers: new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }) };
  const row = buildActivityLogRow({ userId: 1, userEmail: 'a@a.com' }, 'login_success', { req });
  expect(row.ip).toBe('1.2.3.4');
});
