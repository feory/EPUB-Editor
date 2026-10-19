import { test, expect } from 'bun:test';
import { stmt } from './database.js';
import { displayName } from './display-name.js';
import { makeUser } from './test-helpers.js';

// A regra existe em SQL e em JS: têm de dar sempre o mesmo (SQL real, base em memória).
const CASES = [
  { first: 'Ana', last: 'Silva' },
  { first: 'Ana', last: null },
  { first: null, last: 'Silva' },
  { first: null, last: null },
  { first: '', last: '' },
  { first: '   ', last: 'Silva' },
  { first: 'Ana', last: '   ' },
  { first: 'Ana Maria', last: 'Silva Costa' },
];

for (const c of CASES) {
  test(`SQL e JS concordam: ${JSON.stringify(c)}`, () => {
    const u = makeUser({ first: c.first, last: c.last });
    const row = stmt.getUserById.get(u.id);
    expect(row.name).toBe(displayName(row));
  });
}

test('sem nome cai para o email; com nome, o nome', () => {
  const none = makeUser();
  expect(displayName({ first_name: null, last_name: null, email: none.email })).toBe(none.email);
  expect(displayName({ first_name: ' Ana ', last_name: ' Silva ', email: 'a@x.pt' })).toBe('Ana Silva');
});
