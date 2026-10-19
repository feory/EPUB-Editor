// Dados de teste na base em memória (ver test-setup.js). O módulo database.js é partilhado por todos os
// testes do processo: cada teste cria os seus utilizadores/ebooks com ids únicos e não depende de mais nada.
import { stmt } from './database.js';

let n = 0;
export const uid = (prefix) => `${prefix}-${process.pid}-${++n}`;

/** Utilizador na BD + a forma que os handlers recebem do JWT ({ sub, role, email }). */
export function makeUser({ role = 'user', first = null, last = null, passwordHash = 'x', email = `${uid('u')}@t.pt` } = {}) {
  const id = Number(stmt.createUser.run(email, passwordHash, role, first, last).lastInsertRowid);
  return { id, sub: String(id), role, email };
}

export function makeEbook(owner, isbn = uid('isbn')) {
  stmt.insertEbook.run(isbn, null, 'Título', 'Autor', 'in_progress', owner.id);
  return isbn;
}

export const post = (body, url = 'http://x') => new Request(url, { method: 'POST', body: JSON.stringify(body) });
export const put = (body, url = 'http://x') => new Request(url, { method: 'PUT', body: JSON.stringify(body) });
