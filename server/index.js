import { existsSync, mkdirSync } from 'fs';
import { PORT, DATA_DIR, TEMP_DIR, ADMIN_EMAIL, ADMIN_PASSWORD } from './config.js';
import { db, stmt, migrateGrammarToDb, purgeOldTrash } from './database.js';
import { corsHeaders, safeSegment } from './response.js';
import { cleanupTempDir } from './temp-cleanup.js';
import { requireAuth } from './middleware/auth.js';
import { purgeRateLimitStore } from './middleware/rateLimit.js';
import * as authRoutes from './routes/auth.js';
import * as ebooks from './routes/ebooks.js';
import * as content from './routes/content.js';
import * as grammar from './routes/grammar.js';
import * as epub from './routes/epub.js';
import * as images from './routes/images.js';
import * as trash from './routes/trash.js';
import * as maintenance from './routes/maintenance.js';
import * as validation from './routes/validation.js';
import * as presence from './presence.js';

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR);
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR);

cleanupTempDir();
const cleanupInterval = setInterval(() => {
  cleanupTempDir();
  stmt.purgeExpiredTokens.run();
  purgeRateLimitStore();
}, 30 * 60 * 1000);

migrateGrammarToDb();
purgeOldTrash();

async function seedAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return null;
  const existing = stmt.getUserByEmail.get(ADMIN_EMAIL);
  if (existing) return existing.id;
  const hash = await Bun.password.hash(ADMIN_PASSWORD);
  const result = stmt.createUser.run(ADMIN_EMAIL, hash, 'admin');
  console.log(`Admin user created: ${ADMIN_EMAIL}`);
  return result.lastInsertRowid;
}

const adminId = await seedAdmin();
if (adminId) {
  db.run('UPDATE ebooks SET user_id = ? WHERE user_id IS NULL', [adminId]);
}

export const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
      // Public auth routes
      if (path === "/api/auth/login"   && method === "POST") return authRoutes.login(req);
      if (path === "/api/auth/refresh" && method === "POST") return authRoutes.refresh(req);
      if (path === "/api/auth/logout"  && method === "POST") return authRoutes.logout(req);
      if (path === "/api/health"       && method === "GET")  return maintenance.healthCheck();

      // Image/cover GET is public — browser renders <img src="..."> without auth headers
      if (method === "GET" && path.startsWith("/api/ebooks/")) {
        const parts = path.split('/');
        const isbn = parts[3];
        if (!safeSegment(isbn)) return new Response("Not Found", { status: 404, headers: corsHeaders });
        if (parts.length >= 6 && parts[4] === 'images' && parts[5] && parts[5] !== 'batch') {
          const imageId = parts[5];
          if (!safeSegment(imageId)) return new Response("Not Found", { status: 404, headers: corsHeaders });
          return images.getImage(isbn, imageId, url);
        }
        if (parts.length === 5 && parts[4] === 'cover') {
          return epub.getCover(isbn);
        }
      }

      // All other routes require authentication
      const [user, authErr] = await requireAuth(req);
      if (authErr) return authErr;

      // Auth user management
      if (path === "/api/auth/me"    && method === "GET")    return authRoutes.me(user);
      if (path === "/api/auth/users" && method === "GET")    return authRoutes.listUsers(req, user);
      if (path === "/api/users"      && method === "GET")    return authRoutes.listBasicUsers(user);
      if (path === "/api/auth/users" && method === "POST")   return authRoutes.createUser(req, user);
      if (path.startsWith("/api/auth/users/") && method === "DELETE") {
        return authRoutes.deleteUser(req, user, path.split('/')[4]);
      }
      if (path.startsWith("/api/auth/users/") && method === "PUT") {
        return authRoutes.updateUser(req, user, path.split('/')[4]);
      }

      // Ebooks list/create
      if (path === "/api/ebooks") {
        if (method === "GET")  return ebooks.listEbooks(req, user);
        if (method === "POST") return ebooks.createEbook(req, user);
      }

      // Trash (user-scoped)
      if (path === "/api/trash" && method === "GET") return trash.listTrash(req, user);

      if (path.startsWith("/api/trash/")) {
        const parts = path.split('/');
        const isbn = parts[3];
        if (!safeSegment(isbn)) return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
        // Verify ownership before trash operations (admin bypasses)
        const trashEbook = stmt.getEbook.get(isbn);
        if (!trashEbook || (user.role !== 'admin' && trashEbook.user_id !== Number(user.sub))) {
          return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
        }
        if (parts.length === 5 && parts[4] === 'restore' && method === "POST") return trash.restoreEbook(isbn);
        if (parts.length === 4 && method === "DELETE") return trash.hardDeleteEbook(isbn);
      }

      // Maintenance
      if (path === "/api/maintenance/cleanup-history" && method === "POST") return maintenance.cleanupHistory(user);
      if (path === "/api/maintenance/migrate-epubs"   && method === "POST") return maintenance.migrateEpubs(user);
      if (path === "/api/languagetool/check"          && method === "POST") return maintenance.languageTool(req);

      // Per-ebook routes
      if (path.startsWith("/api/ebooks/")) {
        const parts = path.split('/');
        const isbn = parts[3];
        if (!safeSegment(isbn)) return new Response("Not Found", { status: 404, headers: corsHeaders });

        // Ownership check for all per-ebook operations (admin bypasses; utilizadores com
        // partilha ativa em ebook_shares têm o mesmo acesso do dono)
        const ebook = stmt.getEbook.get(isbn);
        const hasAccess = ebook && (user.role === 'admin' || ebook.user_id === Number(user.sub)
          || stmt.hasShareAccess.get(isbn, Number(user.sub)));
        if (!hasAccess) {
          return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
        }

        // Identidade por separador/janela (não por utilizador) — distingue 2 janelas da mesma conta
        const clientId = req.headers.get('x-client-id') || `u:${user.sub}`;

        // Presence / edit-lock (heartbeat). Excluído do guard de escrita abaixo.
        if (parts.length === 5 && parts[4] === 'presence') {
          if (method === "POST")   return Response.json(presence.touch(isbn, clientId, user.email), { headers: corsHeaders });
          if (method === "DELETE") { presence.release(isbn, clientId); return Response.json({ ok: true }, { headers: corsHeaders }); }
        }

        // Write-lock: só o detentor do lock pode escrever quando alguém está presente
        if ((method === "POST" || method === "PUT" || method === "DELETE")
            && presence.anyonePresent(isbn) && !presence.isHolder(isbn, clientId)) {
          return Response.json({ error: 'locked', editor: presence.holderEmail(isbn) }, { status: 409, headers: corsHeaders });
        }

        if (parts.length === 4) {
          if (method === "GET")    return ebooks.getEbook(isbn);
          if (method === "DELETE") return ebooks.deleteEbook(isbn);
        }

        if (parts.length === 5) {
          const sub = parts[4];
          if (sub === 'status'               && method === "PUT")  return ebooks.updateStatus(req, isbn);
          if (sub === 'metadata'             && method === "PUT")  return ebooks.updateMetadata(req, isbn);
          if (sub === 'content'              && method === "POST") return content.saveContent(req, isbn);
          if (sub === 'content'              && method === "GET")  return content.getContent(req, isbn, url);
          if (sub === 'history'              && method === "GET")  return content.getHistory(req, isbn);
          if (sub === 'cover'                && method === "GET")  return epub.getCover(isbn);
          if (sub === 'cover'                && method === "POST") return epub.saveCover(req, isbn);
          if (sub === 'grammar'              && method === "GET")  return grammar.getGrammar(isbn);
          if (sub === 'grammar'              && method === "POST") return grammar.saveGrammar(req, isbn);
          if (sub === 'validate'             && method === "POST") return validation.validate(req);
          if (sub === 'validate-accessibility' && method === "POST") return validation.validateAccessibility(req, isbn);
          if (sub === 'epub'                 && method === "POST") return epub.saveEpub(req, isbn);
          if (sub === 'epub'                 && method === "GET")  return epub.getEpub(isbn);
          if (sub === 'epubs'                && method === "GET")  return epub.getEpubHistory(isbn);
          if (sub === 'style'                && method === "GET")  return epub.getStyle(isbn);
          if (sub === 'style'                && method === "PUT")  return epub.saveStyle(req, isbn);
          if (sub === 'share'                && method === "GET")  return ebooks.listShares(isbn, user);
          if (sub === 'share'                && method === "POST") return ebooks.shareEbook(req, isbn, user);
        }

        if (parts.length === 6 && parts[4] === 'epubs' && method === "GET") {
          return epub.getEpubFile(isbn, parts[5]);
        }

        if (parts.length === 6 && parts[4] === 'share' && method === "DELETE") {
          return ebooks.unshareEbook(isbn, parts[5], user);
        }

        if (parts.length >= 5 && parts[4] === 'images') {
          if (parts.length === 5 && method === "GET") return images.listImages(req, isbn);
          if (parts.length >= 6) {
            const imageId = parts[5];
            if (imageId !== 'batch' && !safeSegment(imageId)) {
              return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
            }
            if (imageId === 'batch' && method === "POST") return images.batchImages(req, isbn);
            if (method === "GET")    return images.getImage(isbn, imageId, url);
            if (method === "PUT")    return images.renameImage(req, isbn, imageId);
            if (method === "DELETE") return images.deleteImage(isbn, imageId);
            if (method === "POST")   return images.saveSingleImage(req, isbn, imageId);
          }
        }
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error('[Server]', err);
      return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
  },
});

console.log(`Server running at http://localhost:${server.port}`);

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  clearInterval(cleanupInterval);
  console.log('→ Cleanup interval cleared');
  server.stop();
  console.log('→ Server stopped accepting connections');
  db.close();
  console.log('→ Database connection closed');
  cleanupTempDir();
  console.log('→ Temp directory cleaned');
  console.log('Goodbye!');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
