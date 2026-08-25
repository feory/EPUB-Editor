import { stmt } from './database.js';
import { getClientIp } from './response.js';

// actor a partir do payload JWT já decodificado ({sub, email, role}) — poupa os call sites
// autenticados de repetirem Number(user.sub)/user.email. login_failed/logout constroem o
// actor à mão (não há JWT válido nesses casos).
export function actorFromUser(user) {
  return { userId: Number(user.sub), userEmail: user.email };
}

// Row pura, sem I/O — separada de logActivity para ser testável sem tocar na BD.
export function buildActivityLogRow(actor, action, { target = null, meta = null, req = null } = {}) {
  const ip = req ? getClientIp(req) : null;
  return {
    userId: actor?.userId ?? null,
    userEmail: actor?.userEmail ?? null,
    action,
    target,
    meta: meta ? JSON.stringify(meta) : null,
    ip,
  };
}

// actor é sempre { userId, userEmail } (não o payload JWT bruto) — suporta login falhado,
// onde não há JWT nenhum.
export function logActivity(actor, action, opts) {
  const row = buildActivityLogRow(actor, action, opts);
  stmt.insertActivityLog.run(row.userId, row.userEmail, row.action, row.target, row.meta, row.ip);
}
