import { stmt } from '../database.js';
import { corsHeaders } from '../response.js';

// Quem é avisado de quê vive AQUI: as rotas só dizem o que aconteceu.
//   { kind: 'share',   isbn, actorId, targetUserId }    → avisa quem recebeu o ebook
//   { kind: 'comment', isbn, actorId, parentAuthorId? } → resposta: avisa o autor da thread; comentário novo: o dono do ebook
/** Nunca avisa o próprio; nunca rebenta a ação que o originou. */
export function emit(event) {
  const { kind, isbn, actorId } = event;
  if (kind === 'share') return notify(event.targetUserId, 'share', isbn, actorId);
  if (kind === 'comment') {
    return event.parentAuthorId != null
      ? notify(event.parentAuthorId, 'comment_reply', isbn, actorId)
      : notify(stmt.getEbook.get(isbn)?.user_id, 'comment', isbn, actorId);
  }
}

/** Avisa `userId` de algo que `actorId` fez. Nunca avisa o próprio; nunca rebenta a ação que o originou. */
function notify(userId, type, isbn, actorId) {
  if (!userId || userId === actorId) return;
  try {
    stmt.insertNotification.run(userId, type, isbn, actorId);
    stmt.pruneNotifications.run(userId);
  } catch (err) { console.error('[Notifications]', err.message); }
}

// GET /api/notifications → { notifications (50 mais recentes), unread }
export function listNotifications(user) {
  const id = Number(user.sub);
  return Response.json({
    notifications: stmt.listNotifications.all(id),
    unread: stmt.countUnreadNotifications.get(id).n,
  }, { headers: corsHeaders });
}

// POST /api/notifications/read  { id? } — sem id, marca todas.
export async function markRead(req, user) {
  const { id } = await req.json().catch(() => ({}));
  if (id != null) stmt.markNotificationRead.run(Number(id), Number(user.sub));
  else stmt.markAllNotificationsRead.run(Number(user.sub));
  return listNotifications(user);
}
