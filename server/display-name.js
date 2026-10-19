// "Nome a mostrar" de um utilizador: "Nome Apelido", ou o email se não houver nome. A regra existe em DUAS formas
// (SQL para as queries que juntam utilizadores, JS para respostas montadas à mão) — vivem lado a lado e
// server/display-name.test.js garante que concordam. Sem imports: database.js e auth.js dependem daqui.

/** Expressão SQL para a tabela users com o alias `a`. */
export const displayNameSql = (a) =>
  `COALESCE(NULLIF(TRIM(COALESCE(${a}.first_name, '') || ' ' || COALESCE(${a}.last_name, '')), ''), ${a}.email)`;

/** O mesmo em JS, para uma linha com { first_name, last_name, email }. */
export const displayName = (u) =>
  [u.first_name, u.last_name].map(s => s?.trim()).filter(Boolean).join(' ') || u.email;
