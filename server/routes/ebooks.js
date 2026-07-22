import { existsSync, mkdirSync, renameSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { db, stmt } from '../database.js';
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

// O conteúdo gravado (parágrafos de imagem) referencia a capa/galeria por URL absoluto
// "/api/ebooks/<isbn>/images/..." (não por data-image-id só — precisa de um src real para o
// TinyMCE mostrar) — fica preso ao ISBN antigo em cada versão do histórico. Reescreve todas
// (não só a mais recente: restaurar uma versão antiga tem de continuar a funcionar).
// Formato do ficheiro (ver src/utils/compression.ts): "UNCOMPRESSED:<html>" em texto, ou
// base64 de gzip sem prefixo — Bun.gunzipSync lê qualquer gzip standard, independente da lib
// que o gerou (fflate no browser).
function rewriteIsbnInHistory(ebookDir, oldIsbn, newIsbn) {
  const historyDir = join(ebookDir, 'history');
  if (!existsSync(historyDir)) return;
  const oldPath = `/api/ebooks/${oldIsbn}/`;
  const newPath = `/api/ebooks/${newIsbn}/`;
  for (const file of readdirSync(historyDir)) {
    if (!file.startsWith('content_') || !(file.endsWith('.html') || file.endsWith('.html.gz'))) continue;
    const filePath = join(historyDir, file);
    const raw = readFileSync(filePath, 'utf8');
    let html, compressed;
    if (raw.startsWith('UNCOMPRESSED:')) {
      html = raw.slice('UNCOMPRESSED:'.length);
      compressed = false;
    } else {
      try {
        html = Buffer.from(Bun.gunzipSync(Buffer.from(raw, 'base64'))).toString('utf8');
        compressed = true;
      } catch (err) {
        console.error(`Skip rewrite (not valid gzip): ${file}`, err.message);
        continue;
      }
    }
    if (!html.includes(oldPath)) continue;
    const rewritten = html.split(oldPath).join(newPath);
    const out = compressed
      ? Buffer.from(Bun.gzipSync(Buffer.from(rewritten, 'utf8'))).toString('base64')
      : `UNCOMPRESSED:${rewritten}`;
    writeFileSync(filePath, out);
  }
}

// A última exportação EPUB é gravada como "<isbn>.epub" (ver saveEpub em epub.js) — o NOME do
// ficheiro fica preso ao ISBN antigo mesmo depois de mover a pasta toda. Versões do histórico
// (`ebook_<timestamp>.epub`) não têm isbn no nome — não precisam de fix.
function renameLatestEpubFile(ebookDir, oldIsbn, newIsbn) {
  const epubDir = join(ebookDir, 'Epub');
  const oldPath = join(epubDir, `${oldIsbn}.epub`);
  if (existsSync(oldPath)) renameSync(oldPath, join(epubDir, `${newIsbn}.epub`));
}

export async function updateMetadata(req, isbn) {
  try {
    const body = await req.json();
    debugLog('Updating metadata for ISBN:', isbn, body);
    const { title, author, description, publisher, language, subjects, pub_date, physical_isbn, ebook_isbn } = body;
    const newIsbn = ebook_isbn && ebook_isbn !== isbn ? ebook_isbn : isbn;

    if (newIsbn !== isbn) {
      if (!safeSegment(newIsbn)) return Response.json({ error: 'ISBN inválido' }, { status: 400, headers: corsHeaders });
      if (stmt.getEbook.get(newIsbn)) return Response.json({ error: 'ISBN já existe' }, { status: 409, headers: corsHeaders });
      // Pasta física do ebook (DATA_DIR/<isbn>) primeiro — se falhar, aborta antes de tocar na BD.
      const oldDir = join(DATA_DIR, isbn);
      if (existsSync(oldDir)) renameSync(oldDir, join(DATA_DIR, newIsbn));
    }

    try {
      db.transaction(() => {
        stmt.updateMetadata.run(title, author, description, publisher, language, subjects, pub_date, physical_isbn, newIsbn, isbn);
        if (newIsbn !== isbn) {
          stmt.renameEbookShares.run(newIsbn, isbn);
          stmt.renameGrammarCache.run(newIsbn, isbn);
          stmt.renameGrammarSession.run(newIsbn, isbn);
        }
      })();
    } catch (dbErr) {
      // Rollback da pasta se a transação falhar depois do rename em disco.
      if (newIsbn !== isbn && existsSync(join(DATA_DIR, newIsbn))) renameSync(join(DATA_DIR, newIsbn), join(DATA_DIR, isbn));
      throw dbErr;
    }

    if (newIsbn !== isbn) {
      rewriteIsbnInHistory(join(DATA_DIR, newIsbn), isbn, newIsbn);
      renameLatestEpubFile(join(DATA_DIR, newIsbn), isbn, newIsbn);
    }

    return Response.json({ message: 'Metadata updated', ebook_isbn: newIsbn }, { headers: corsHeaders });
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
