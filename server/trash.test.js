import { test, expect, afterAll } from 'bun:test';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

process.env.JWT_SECRET ??= 'test-secret';
const { stmt } = await import('./database.js');
const { hardDeleteEbook } = await import('./routes/trash.js');
const { DATA_DIR } = await import('./config.js');

// database.js liga-se ao ebooks.db REAL e o módulo é partilhado por todos os testes do processo:
// nada aqui pode escrever nele → os statements usados são trocados por fakes em memória.
const rows = new Map();
const calls = [];
const FAKES = {
  getEbook: { get: (isbn) => rows.get(isbn) },
  hardDeleteEbook: { run: (isbn) => { rows.delete(isbn); calls.push(['hardDelete', isbn]); } },
  deleteCommentsByIsbn: { run: (isbn) => calls.push(['comments', isbn]) },
  deleteNotificationsByIsbn: { run: () => {} },
  grammarDeleteIsbn: { run: () => {} },
  grammarSessionDelete: { run: () => {} },
  unshareAllForEbook: { run: () => {} },
  insertActivityLog: { run: () => {} },
};
const originals = Object.fromEntries(Object.keys(FAKES).map(k => [k, stmt[k]]));
Object.assign(stmt, FAKES);

const live = `test-trash-live-${process.pid}`;
const trashed = `test-trash-bin-${process.pid}`;
afterAll(() => {
  Object.assign(stmt, originals);
  for (const i of [live, trashed]) rmSync(join(DATA_DIR, i), { recursive: true, force: true });
});

const seed = (isbn, deleted_at = null) => {
  rows.set(isbn, { ebook_isbn: isbn, title: 't', deleted_at });
  mkdirSync(join(DATA_DIR, isbn), { recursive: true });
  writeFileSync(join(DATA_DIR, isbn, 'content.html'), 'x');
};
const admin = { role: 'admin', sub: '1' };
const req = new Request('http://x');

test('hardDeleteEbook: livro ativo (fora do lixo) não é apagado', () => {
  seed(live);
  expect(hardDeleteEbook(req, live, admin).status).toBe(404);
  expect(rows.has(live)).toBe(true);
  expect(existsSync(join(DATA_DIR, live, 'content.html'))).toBe(true);
  expect(calls).toEqual([]);
});

test('hardDeleteEbook: livro no lixo é apagado (BD, comentários e ficheiros)', () => {
  seed(trashed, '2026-10-01 10:00:00');
  expect(hardDeleteEbook(req, trashed, admin).status).toBe(200);
  expect(rows.has(trashed)).toBe(false);
  expect(calls).toEqual([['hardDelete', trashed], ['comments', trashed]]);
  expect(existsSync(join(DATA_DIR, trashed))).toBe(false);
});
