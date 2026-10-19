import { test, expect } from 'bun:test';

process.env.JWT_SECRET ??= 'test-secret';
const { ebookAccess, publicAccess } = await import('./access.js');

// hasShare injetado: nada aqui toca na base de dados.
const ebook = { ebook_isbn: 'x', user_id: 1 };
const owner = { sub: '1', role: 'user' };
const guest = { sub: '2', role: 'user' };
const stranger = { sub: '3', role: 'user' };
const admin = { sub: '9', role: 'admin' };
const shares = (isbn, uid) => uid === 2;

test('dono: vê, apaga, gere partilhas; não "sai"', () => {
  expect(ebookAccess(ebook, owner, shares)).toEqual({ relation: 'owner', view: true, delete: true, manageShares: true, leave: false });
});

test('admin: tudo, mesmo sem partilha', () => {
  expect(ebookAccess(ebook, admin, shares)).toEqual({ relation: 'admin', view: true, delete: true, manageShares: true, leave: false });
});

test('quem recebeu a partilha: vê e sai, mas não apaga nem gere os outros', () => {
  expect(ebookAccess(ebook, guest, shares)).toEqual({ relation: 'shared', view: true, delete: false, manageShares: false, leave: true });
});

test('estranho e ebook inexistente: nada', () => {
  const none = { relation: null, view: false, delete: false, manageShares: false, leave: false };
  expect(ebookAccess(ebook, stranger, shares)).toEqual(none);
  expect(ebookAccess(undefined, owner, shares)).toEqual(none);
});

test('a partilha só é consultada a quem não é dono nem admin', () => {
  const calls = [];
  const spy = (...a) => { calls.push(a); return false; };
  ebookAccess(ebook, owner, spy); ebookAccess(ebook, admin, spy);
  expect(calls).toEqual([]);
  ebookAccess(ebook, stranger, spy);
  expect(calls).toEqual([['x', 3]]);
});

test('publicAccess: o cliente não recebe "view"', () => {
  expect(Object.keys(publicAccess(ebookAccess(ebook, owner, shares))).sort()).toEqual(['delete', 'leave', 'manageShares', 'relation']);
});
