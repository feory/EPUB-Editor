// Acesso de um utilizador a um ebook: UMA regra para o servidor (index.js, ebooks.js, trash) e para o
// cliente (a lista envia `access` por ebook, o cliente deixa de a deduzir de user_id/role).
//   relation: 'owner' | 'admin' (vê tudo) | 'shared' (recebeu a partilha) | null (sem acesso)
//   view     — abrir e editar o ebook
//   delete   — enviar para a reciclagem (só dono e admin; quem recebeu só sai da partilha)
//   manageShares — listar/dar/tirar as partilhas dos outros
//   leave    — remover a PRÓPRIA partilha
import { stmt } from './database.js';

const NO_ACCESS = { relation: null, view: false, delete: false, manageShares: false, leave: false };
const defaultHasShare = (isbn, userId) => !!stmt.hasShareAccess.get(isbn, userId);

/** `hasShare(isbn, userId)` só é chamado a quem não é dono nem admin; injetável nos testes. */
export function ebookAccess(ebook, user, hasShare = defaultHasShare) {
  if (!ebook) return NO_ACCESS;
  const me = Number(user.sub);
  const owner = ebook.user_id === me;
  const admin = user.role === 'admin';
  const shared = !owner && !admin && !!hasShare(ebook.ebook_isbn, me);
  const relation = owner ? 'owner' : admin ? 'admin' : shared ? 'shared' : null;
  const manages = owner || admin;
  return { relation, view: relation !== null, delete: manages, manageShares: manages, leave: shared };
}

/** O que o cliente recebe por ebook. */
export const publicAccess = ({ relation, delete: canDelete, manageShares, leave }) =>
  ({ relation, delete: canDelete, manageShares, leave });
