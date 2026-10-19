import { test, expect, afterAll } from 'bun:test';

process.env.JWT_SECRET ??= 'test-secret';
const { stmt } = await import('./database.js');
const { deleteEbook, unshareEbook, listEbooks } = await import('./routes/ebooks.js');

// database.js liga-se ao ebooks.db REAL: statements trocados por fakes em memória (ver trash.test.js).
const calls = [];
const FAKES = {
  getEbook: { get: () => ({ ebook_isbn: 'x', title: 't', user_id: 1 }) },
  softDeleteEbook: { run: (isbn) => calls.push(['trash', isbn]) },
  unshareEbook: { run: (isbn, uid) => calls.push(['unshare', isbn, uid]) },
  listSharesForEbook: { all: () => [] },
  hasShareAccess: { get: (_isbn, uid) => (uid === 2 ? { 1: 1 } : undefined) },
  listEbooksByUser: { all: () => [{ ebook_isbn: 'x', user_id: 1 }, { ebook_isbn: 'y', user_id: 7 }] },
  insertActivityLog: { run: () => {} },
};
const originals = Object.fromEntries(Object.keys(FAKES).map(k => [k, stmt[k]]));
Object.assign(stmt, FAKES);
afterAll(() => Object.assign(stmt, originals));

const owner = { role: 'user', sub: '1' };
const guest = { role: 'user', sub: '2' };
const admin = { role: 'admin', sub: '9' };
const req = new Request('http://x');

test('quem recebeu a partilha não apaga o ebook (403), o dono e o admin sim', async () => {
  calls.length = 0;
  expect(deleteEbook(req, 'x', guest).status).toBe(403);
  expect(calls).toEqual([]);
  expect(deleteEbook(req, 'x', owner).status).toBe(200);
  expect(deleteEbook(req, 'x', admin).status).toBe(200);
  expect(calls).toEqual([['trash', 'x'], ['trash', 'x']]);
});

test('quem recebeu a partilha remove só a sua; a dos outros não', () => {
  calls.length = 0;
  expect(unshareEbook('x', '2', guest).status).toBe(200);
  expect(unshareEbook('x', '3', guest).status).toBe(403);
  expect(unshareEbook('x', '3', owner).status).toBe(200);
  expect(calls).toEqual([['unshare', 'x', 2], ['unshare', 'x', 3]]);
});

test('a lista traz o acesso por ebook: dono vs partilhado', async () => {
  const res = listEbooks(new Request('http://x'), owner);
  const { data } = await res.json();
  expect(data.map(e => e.access.relation)).toEqual(['owner', 'shared']);
  expect(data[1].access).toEqual({ relation: 'shared', delete: false, manageShares: false, leave: true });
});
