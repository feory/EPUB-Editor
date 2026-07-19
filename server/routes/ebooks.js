import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { stmt } from '../database.js';
import { corsHeaders, jsonResponse, safeSegment } from '../response.js';
import { DATA_DIR } from '../config.js';
import { debugLog } from '../log.js';

export function listEbooks(req, user) {
  const data = user.role === 'admin'
    ? stmt.listEbooks.all()
    : stmt.listEbooksByUser.all(Number(user.sub), Number(user.sub));
  return jsonResponse({ data }, req, corsHeaders);
}

export async function createEbook(req, user) {
  const body = await req.json();
  const { ebook_isbn, physical_isbn, title, author } = body;
  if (!ebook_isbn || !title || !author)
    return new Response("Missing fields", { status: 400, headers: corsHeaders });
  if (!safeSegment(ebook_isbn))
    return new Response("Invalid ISBN", { status: 400, headers: corsHeaders });
  if (stmt.getEbook.get(ebook_isbn))
    return Response.json({ error: 'ISBN já existe' }, { status: 409, headers: corsHeaders });
  const ebookDir = join(DATA_DIR, ebook_isbn);
  if (!existsSync(ebookDir)) mkdirSync(ebookDir, { recursive: true });
  stmt.insertEbook.run(ebook_isbn, physical_isbn, title, author, 'in_progress', Number(user.sub));
  return Response.json({ message: 'success', data: body }, { headers: corsHeaders });
}

export function getEbook(isbn) {
  return Response.json({ data: stmt.getEbook.get(isbn) }, { headers: corsHeaders });
}

export function deleteEbook(isbn) {
  stmt.softDeleteEbook.run(isbn);
  return Response.json({ message: 'Ebook moved to trash' }, { headers: corsHeaders });
}

export async function updateStatus(req, isbn) {
  const { status } = await req.json();
  stmt.updateStatus.run(status, isbn);
  return Response.json({ message: 'Status updated', status }, { headers: corsHeaders });
}

export async function updateMetadata(req, isbn) {
  try {
    const body = await req.json();
    debugLog('Updating metadata for ISBN:', isbn, body);
    const { title, author, description, publisher, language, subjects, pub_date, physical_isbn } = body;
    stmt.updateMetadata.run(title, author, description, publisher, language, subjects, pub_date, physical_isbn, isbn);
    return Response.json({ message: 'Metadata updated' }, { headers: corsHeaders });
  } catch (dbErr) {
    console.error('Database Error during metadata update:', dbErr);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}

// Só o dono do ebook (ou admin) pode gerir a lista de partilha.
function isOwnerOrAdmin(ebook, user) {
  return user.role === 'admin' || (ebook && ebook.user_id === Number(user.sub));
}

export function listShares(isbn, user) {
  const ebook = stmt.getEbook.get(isbn);
  if (!isOwnerOrAdmin(ebook, user))
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  return Response.json({ data: stmt.listSharesForEbook.all(isbn) }, { headers: corsHeaders });
}

export async function shareEbook(req, isbn, user) {
  const ebook = stmt.getEbook.get(isbn);
  if (!isOwnerOrAdmin(ebook, user))
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  const { userId } = await req.json();
  if (!userId) return Response.json({ error: 'Missing userId' }, { status: 400, headers: corsHeaders });
  stmt.shareEbook.run(isbn, Number(userId));
  return Response.json({ data: stmt.listSharesForEbook.all(isbn) }, { headers: corsHeaders });
}

export function unshareEbook(isbn, targetUserId, user) {
  const ebook = stmt.getEbook.get(isbn);
  if (!isOwnerOrAdmin(ebook, user))
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
  stmt.unshareEbook.run(isbn, Number(targetUserId));
  return Response.json({ data: stmt.listSharesForEbook.all(isbn) }, { headers: corsHeaders });
}
