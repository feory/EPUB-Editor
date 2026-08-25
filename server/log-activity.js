import { stmt } from './database.js';

// Row pura, sem I/O — separada de logActivity para ser testável sem tocar na BD.
export function buildActivityLogRow(actor, action, { target = null, meta = null, req = null } = {}) {
  const ip = req?.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
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
