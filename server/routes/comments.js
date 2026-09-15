import { stmt } from '../database.js';
import { corsHeaders } from '../response.js';

export function getComments(isbn) {
  const rows = stmt.commentsListByIsbn.all(isbn);
  return Response.json({ comments: rows }, { headers: corsHeaders });
}

const MAX_TEXT = 5_000;

export async function addComment(req, isbn, user) {
  const { anchorId, parentId, text } = await req.json();
  if (typeof anchorId !== 'string' || !anchorId) {
    return Response.json({ error: 'anchorId em falta' }, { status: 400, headers: corsHeaders });
  }
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) {
    return Response.json({ error: 'Texto inválido' }, { status: 400, headers: corsHeaders });
  }
  let parent = null;
  if (parentId != null) {
    parent = stmt.getComment.get(parentId);
    if (!parent || parent.ebook_isbn !== isbn) {
      return Response.json({ error: 'Thread não encontrada' }, { status: 404, headers: corsHeaders });
    }
  }
  const result = stmt.insertComment.run(isbn, anchorId, parentId ?? null, Number(user.sub), text.trim());
  const comment = stmt.getComment.get(result.lastInsertRowid);
  return Response.json({ comment }, { headers: corsHeaders });
}

export async function resolveComment(req, isbn, id, user) {
  const comment = stmt.getComment.get(id);
  if (!comment || comment.ebook_isbn !== isbn) {
    return Response.json({ error: 'Não encontrado' }, { status: 404, headers: corsHeaders });
  }
  const { resolved } = await req.json();
  stmt.resolveComment.run(resolved ? 1 : 0, id);
  return Response.json({ ok: true }, { headers: corsHeaders });
}

export function deleteComment(isbn, id, user) {
  const comment = stmt.getComment.get(id);
  if (!comment || comment.ebook_isbn !== isbn) {
    return Response.json({ error: 'Não encontrado' }, { status: 404, headers: corsHeaders });
  }
  if (user.role !== 'admin' && comment.user_id !== Number(user.sub)) {
    return Response.json({ error: 'Sem permissão' }, { status: 403, headers: corsHeaders });
  }
  stmt.deleteComment.run(id, id);
  return Response.json({ ok: true }, { headers: corsHeaders });
}
