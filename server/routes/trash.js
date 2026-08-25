import { rmSync } from 'fs';
import { join } from 'path';
import { stmt } from '../database.js';
import { corsHeaders, jsonResponse } from '../response.js';
import { DATA_DIR } from '../config.js';
import { logActivity, actorFromUser } from '../log-activity.js';

export function listTrash(req, user) {
  const data = user.role === 'admin'
    ? stmt.listTrash.all()
    : stmt.listTrashByUser.all(Number(user.sub));
  return jsonResponse({ data }, req, corsHeaders);
}

export function restoreEbook(isbn) {
  stmt.restoreEbook.run(isbn);
  return Response.json({ message: 'Ebook restored' }, { headers: corsHeaders });
}

export function hardDeleteEbook(req, isbn, user) {
  const ebook = stmt.getEbook.get(isbn);
  stmt.hardDeleteEbook.run(isbn);
  stmt.grammarDeleteIsbn.run(isbn);
  stmt.grammarSessionDelete.run(isbn);
  stmt.unshareAllForEbook.run(isbn);
  try { rmSync(join(DATA_DIR, isbn), { recursive: true, force: true }); }
  catch (err) { console.error(`[Trash] Falha ao remover ficheiros de ${isbn}:`, err.message); }
  logActivity(actorFromUser(user), 'ebook_delete_permanent',
    { target: isbn, meta: { title: ebook?.title }, req });
  return Response.json({ message: 'Ebook permanently deleted' }, { headers: corsHeaders });
}
