import { test, expect } from 'bun:test';
import { stmt } from './database.js';
import { deleteEbook, unshareEbook, listEbooks } from './routes/ebooks.js';
import { makeUser, makeEbook } from './test-helpers.js';

// SQL real, base em memória (test-setup.js).
const owner = makeUser({ first: 'Rita', last: 'Dias' });
const guest = makeUser();
const stranger = makeUser();
const admin = makeUser({ role: 'admin' });
const isbn = makeEbook(owner);
stmt.shareEbook.run(isbn, guest.id);
const req = new Request('http://x');
const trashed = () => !!stmt.getEbook.get(isbn).deleted_at;

test('quem recebeu a partilha não apaga o ebook (403), o dono e o admin sim', () => {
  expect(deleteEbook(req, isbn, guest).status).toBe(403);
  expect(deleteEbook(req, isbn, stranger).status).toBe(403);
  expect(trashed()).toBe(false);
  expect(deleteEbook(req, isbn, owner).status).toBe(200);
  expect(trashed()).toBe(true);
  stmt.restoreEbook.run(isbn);
  expect(deleteEbook(req, isbn, admin).status).toBe(200);
  stmt.restoreEbook.run(isbn);
});

test('quem recebeu a partilha remove só a sua; a dos outros não', () => {
  const other = makeUser();
  stmt.shareEbook.run(isbn, other.id);
  expect(unshareEbook(isbn, String(other.id), guest).status).toBe(403);
  expect(stmt.hasShareAccess.get(isbn, other.id)).toBeTruthy();
  expect(unshareEbook(isbn, String(guest.id), guest).status).toBe(200);
  expect(stmt.hasShareAccess.get(isbn, guest.id)).toBeFalsy();
  expect(unshareEbook(isbn, String(other.id), owner).status).toBe(200);
  expect(stmt.hasShareAccess.get(isbn, other.id)).toBeFalsy();
  stmt.shareEbook.run(isbn, guest.id);
});

test('a lista traz o acesso e o dono por ebook (SQL real)', async () => {
  const mine = (await listEbooks(req, owner).json()).data.find(e => e.ebook_isbn === isbn);
  expect(mine.access).toEqual({ relation: 'owner', delete: true, manageShares: true, leave: false });
  const theirs = (await listEbooks(req, guest).json()).data.find(e => e.ebook_isbn === isbn);
  expect(theirs.access).toEqual({ relation: 'shared', delete: false, manageShares: false, leave: true });
  expect(theirs.owner_name).toBe('Rita Dias');
  expect((await listEbooks(req, stranger).json()).data.some(e => e.ebook_isbn === isbn)).toBe(false);
});
