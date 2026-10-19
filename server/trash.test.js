import { test, expect, afterAll } from 'bun:test';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { db, stmt } from './database.js';
import { hardDeleteEbook } from './routes/trash.js';
import { DATA_DIR } from './config.js';
import { makeUser, makeEbook } from './test-helpers.js';
import { emit } from './routes/notifications.js';

// SQL real, base em memória (test-setup.js); só os ficheiros em DATA_DIR são de verdade e limpam-se no fim.
const admin = makeUser({ role: 'admin' });
const owner = makeUser();
const live = makeEbook(owner);
const trashed = makeEbook(owner);
afterAll(() => { for (const i of [live, trashed]) rmSync(join(DATA_DIR, i), { recursive: true, force: true }); });

const seedFiles = (isbn) => {
  mkdirSync(join(DATA_DIR, isbn), { recursive: true });
  writeFileSync(join(DATA_DIR, isbn, 'content.html'), 'x');
};
const exists = (isbn) => !!stmt.getEbook.get(isbn);
const req = new Request('http://x');

test('hardDeleteEbook: livro ativo (fora do lixo) não é apagado', () => {
  seedFiles(live);
  expect(hardDeleteEbook(req, live, admin).status).toBe(404);
  expect(exists(live)).toBe(true);
  expect(existsSync(join(DATA_DIR, live, 'content.html'))).toBe(true);
});

test('hardDeleteEbook: livro no lixo é apagado (BD, comentários, avisos, partilhas e ficheiros)', () => {
  seedFiles(trashed);
  stmt.softDeleteEbook.run(trashed);
  stmt.insertComment.run(trashed, 'a', null, owner.id, 'olá');
  stmt.shareEbook.run(trashed, admin.id);
  emit({ kind: 'share', isbn: trashed, actorId: admin.id, targetUserId: owner.id });
  expect(stmt.listNotifications.all(owner.id).some(n => n.ebook_isbn === trashed)).toBe(true);

  expect(hardDeleteEbook(req, trashed, admin).status).toBe(200);
  expect(exists(trashed)).toBe(false);
  expect(stmt.commentsListByIsbn.all(trashed)).toEqual([]);
  expect(stmt.listNotifications.all(owner.id).some(n => n.ebook_isbn === trashed)).toBe(false);
  expect(stmt.hasShareAccess.get(trashed, admin.id)).toBeFalsy();
  expect(existsSync(join(DATA_DIR, trashed))).toBe(false);
});
