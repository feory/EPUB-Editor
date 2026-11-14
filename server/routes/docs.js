// Documentação (página «Documentação»): os guias vêm de ficheiros markdown no código; o administrador pode reescrevê-los na
// própria página. A versão editada fica na tabela `settings` (chave `docs_<id>`) e passa à frente da original; apagá-la repõe a original.
import { requireAdmin } from '../middleware/auth.js';
import { corsHeaders } from '../response.js';
import { stmt, db } from '../database.js';

export const DOC_IDS = ['editor', 'comofazer', 'assistente'];
const MAX_CHARS = 200_000;

const json = (body, status = 200) => Response.json(body, { status, headers: corsHeaders });
const key = (id) => `docs_${id}`;

/** GET /api/docs — só os guias que o administrador editou: { [id]: markdown }. Qualquer utilizador autenticado. */
export function listDocs() {
  const out = {};
  for (const id of DOC_IDS) {
    const row = stmt.getSetting.get(key(id));
    if (row) out[id] = row.value;
  }
  return json(out);
}

/** PUT /api/docs/:id { content } — admin. */
export async function putDoc(req, id, user) {
  const err = requireAdmin(user);
  if (err) return err;
  if (!DOC_IDS.includes(id)) return json({ error: 'Not Found' }, 404);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const content = body?.content;
  if (typeof content !== 'string' || !content.trim()) return json({ error: 'O texto não pode ficar vazio.' }, 400);
  if (content.length > MAX_CHARS) return json({ error: 'O texto é grande demais.' }, 413);
  stmt.setSetting.run(key(id), content);
  return json({ ok: true });
}

/** DELETE /api/docs/:id — admin: volta a valer a versão original. */
export function resetDoc(id, user) {
  const err = requireAdmin(user);
  if (err) return err;
  if (!DOC_IDS.includes(id)) return json({ error: 'Not Found' }, 404);
  db.prepare('DELETE FROM settings WHERE key = ?').run(key(id));
  return json({ ok: true });
}
