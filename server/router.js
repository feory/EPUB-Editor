import { stmt } from './database.js';
import { corsHeaders, safeSegment, bodyTooLarge } from './response.js';
import { requireAuth } from './middleware/auth.js';
import * as authRoutes from './routes/auth.js';
import * as notifications from './routes/notifications.js';
import { ebookAccess } from './access.js';
import * as trash from './routes/trash.js';
import * as maintenance from './routes/maintenance.js';
import * as logs from './routes/logs.js';
import * as ebooks from './routes/ebooks.js';
import * as aiAdmin from './routes/ai-admin.js';
import * as docs from './routes/docs.js';
import * as presence from './presence.js';
import { matchEbookRoute, isPublic, isLockExempt, bodyLimit, DEFAULT_MAX_BODY } from './ebook-routes.js';

const AUTH_MAX_BODY = 16 * 1024; // login, sessão, palavra-passe, utilizadores: só campos de texto

// O router da API: pedido → resposta. Sem arranque nem tarefas de fundo (isso é server/index.js), por isso os testes chamam-no
// diretamente com um Request, sem portas.
export async function handleRequest(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Fora dos pedidos por-ebook (que levam o limite da sua rota) ninguém envia mais que um JSON pequeno; o login/sessão, aberto a todos, menos ainda.
  if (!path.startsWith("/api/ebooks/")) {
    const tooBig = bodyTooLarge(req, path.startsWith("/api/auth/") ? AUTH_MAX_BODY : DEFAULT_MAX_BODY);
    if (tooBig) return tooBig;
  }

  try {
    // Public auth routes
    if (path === "/api/auth/login"   && method === "POST") return authRoutes.login(req);
    if (path === "/api/auth/refresh" && method === "POST") return authRoutes.refresh(req);
    if (path === "/api/auth/logout"  && method === "POST") return authRoutes.logout(req);
    if (path === "/api/health"       && method === "GET")  return maintenance.healthCheck();

    // GET público: capa e imagens (o <img> do browser não leva token) — ver `public` em ebook-routes.js
    if (method === "GET" && path.startsWith("/api/ebooks/")) {
      const parts = path.split('/');
      const isbn = parts[3];
      if (!safeSegment(isbn)) return new Response("Not Found", { status: 404, headers: corsHeaders });
      const hit = matchEbookRoute(method, parts.slice(4));
      if (isPublic(hit)) return hit.route[2]({ req, url, isbn, params: hit.params });
    }

    // All other routes require authentication
    const [user, authErr] = await requireAuth(req);
    if (authErr) return authErr;

    // Auth user management
    if (path === "/api/auth/me"    && method === "GET")    return authRoutes.me(user);
    if (path === "/api/auth/password" && method === "POST") return authRoutes.changePassword(req, user);
    if (path === "/api/auth/profile"  && method === "PUT")  return authRoutes.updateProfile(req, user);
    if (path === "/api/notifications"      && method === "GET")  return notifications.listNotifications(user);
    if (path === "/api/notifications/read" && method === "POST") return notifications.markRead(req, user);
    if (path === "/api/auth/users" && method === "GET")    return authRoutes.listUsers(req, user);
    if (path === "/api/users"      && method === "GET")    return authRoutes.listBasicUsers(user);
    if (path === "/api/auth/users" && method === "POST")   return authRoutes.createUser(req, user);
    if (path.startsWith("/api/auth/users/") && method === "DELETE") {
      return authRoutes.deleteUser(req, user, path.split('/')[4]);
    }
    if (path.startsWith("/api/auth/users/") && method === "PUT") {
      return authRoutes.updateUser(req, user, path.split('/')[4]);
    }

    // Activity log (Painel > separador Logs) — admin-only, gate dentro do handler
    if (path === "/api/logs" && method === "GET") return logs.listActivityLog(req, user);

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
      if (!ebookAccess(trashEbook, user).delete) {
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
      }
      if (parts.length === 5 && parts[4] === 'restore' && method === "POST") return trash.restoreEbook(isbn);
      if (parts.length === 4 && method === "DELETE") return trash.hardDeleteEbook(req, isbn, user);
    }

    // IA (Painel → separador IA): chave e modelo da OpenRouter — admin
    if (path === "/api/ai/settings") {
      if (method === "GET") return aiAdmin.getSettings(user);
      if (method === "PUT") return aiAdmin.putSettings(req, user);
    }
    if (path === "/api/ai/settings/test" && method === "POST") return aiAdmin.testConnection(user);
    if (path === "/api/ai/models"        && method === "GET")  return aiAdmin.listModels(user);
    if (path === "/api/ai/usage"         && method === "GET")  return aiAdmin.getUsage(url, user);

    // Documentação: GET qualquer utilizador; editar/repor só admin
    if (path === "/api/docs" && method === "GET") return docs.listDocs();
    if (path.startsWith("/api/docs/")) {
      const docId = path.slice("/api/docs/".length);
      if (method === "PUT")    return docs.putDoc(req, docId, user);
      if (method === "DELETE") return docs.resetDoc(docId, user);
    }

    // Maintenance
    if (path === "/api/maintenance/cleanup-history" && method === "POST") return maintenance.cleanupHistory(user);
    if (path === "/api/maintenance/cleanup-settings") {
      if (method === "GET") return maintenance.getCleanupSettings(user);
      if (method === "PUT") return maintenance.setCleanupSettings(req, user);
    }
    if (path === "/api/maintenance/trash-settings") {
      if (method === "GET") return maintenance.getTrashSettings(user);
      if (method === "PUT") return maintenance.setTrashSettings(req, user);
    }
    if (path === "/api/maintenance/migrate-epubs"   && method === "POST") return maintenance.migrateEpubs(user);
    if (path === "/api/maintenance/disk-usage"      && method === "GET")  return maintenance.diskUsage(user);
    if (path === "/api/maintenance/presence"        && method === "GET")  return maintenance.getPresence(user);
    if (path.startsWith("/api/maintenance/orphans/") && method === "DELETE") {
      return maintenance.purgeOrphan(user, path.split('/')[4]);
    }
    if (path === "/api/maintenance/backup"          && method === "POST") return maintenance.runBackup(user);
    if (path === "/api/maintenance/backup-log"      && method === "GET")  return maintenance.getBackupLog(user);
    if (path === "/api/maintenance/backup-schedule") {
      if (method === "GET") return maintenance.getBackupSchedule(user);
      if (method === "PUT") return maintenance.setBackupSchedule(req, user);
    }
    if (path === "/api/languagetool/check"          && method === "POST") return maintenance.languageTool(req);
    if (path === "/api/languagetool/status"         && method === "GET")  return maintenance.languageToolStatus();

    // Per-ebook routes
    if (path.startsWith("/api/ebooks/")) {
      const parts = path.split('/');
      const isbn = parts[3];
      if (!safeSegment(isbn)) return new Response("Not Found", { status: 404, headers: corsHeaders });

      // Ownership check for all per-ebook operations (admin bypasses; utilizadores com
      // partilha ativa em ebook_shares têm o mesmo acesso do dono)
      const ebook = stmt.getEbook.get(isbn);
      if (!ebookAccess(ebook, user).view) {
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers: corsHeaders });
      }

      // Identidade por separador/janela (não por utilizador) — distingue 2 janelas da mesma conta
      const clientId = req.headers.get('x-client-id') || `u:${user.sub}`;
      const rest = parts.slice(4);
      const hit = matchEbookRoute(method, rest);
      const tooBig = bodyTooLarge(req, bodyLimit(hit));
      if (tooBig) return tooBig;

      // Write-lock: só o detentor do lock pode escrever quando alguém está presente
      if ((method === "POST" || method === "PUT" || method === "DELETE") && !isLockExempt(hit, rest)
          && presence.anyonePresent(isbn) && !presence.isHolder(isbn, clientId)) {
        return Response.json({ error: 'locked', editor: presence.holderEmail(isbn) }, { status: 409, headers: corsHeaders });
      }

      if (hit) return hit.route[2]({ req, url, isbn, user, clientId, params: hit.params });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  } catch (err) {
    console.error('[Server]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}
