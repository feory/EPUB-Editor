import { test, expect, afterAll } from 'bun:test';

process.env.JWT_SECRET ??= 'test-secret';
const { stmt } = await import('./database.js');
const { notify, markRead } = await import('./routes/notifications.js');
const { addComment } = await import('./routes/comments.js');

// database.js liga-se ao ebooks.db REAL: statements trocados por fakes em memória (ver trash.test.js).
const sent = [];
const comments = new Map([[7, { id: 7, ebook_isbn: 'x', user_id: 3 }]]);
const FAKES = {
  insertNotification: { run: (...a) => sent.push(a) },
  pruneNotifications: { run: () => {} },
  insertComment: { run: () => ({ lastInsertRowid: 8 }) },
  getComment: { get: (id) => comments.get(id) ?? { id, ebook_isbn: 'x', user_id: 1 } },
  getEbook: { get: () => ({ ebook_isbn: 'x', user_id: 1 }) },
  markNotificationRead: { run: (...a) => sent.push(['read', ...a]) },
  markAllNotificationsRead: { run: (...a) => sent.push(['readAll', ...a]) },
  listNotifications: { all: () => [] },
  countUnreadNotifications: { get: () => ({ n: 0 }) },
};
const originals = Object.fromEntries(Object.keys(FAKES).map(k => [k, stmt[k]]));
Object.assign(stmt, FAKES);
afterAll(() => Object.assign(stmt, originals));

const post = (body) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) });

test('notify: nunca avisa o próprio nem destinatário vazio', () => {
  sent.length = 0;
  notify(2, 'share', 'x', 2);
  notify(undefined, 'share', 'x', 2);
  expect(sent).toEqual([]);
  notify(3, 'share', 'x', 2);
  expect(sent).toEqual([[3, 'share', 'x', 2]]);
});

test('comentários: resposta avisa quem abriu a thread; comentário novo avisa o dono', async () => {
  sent.length = 0;
  await addComment(post({ anchorId: 'a', parentId: 7, text: 'ok' }), 'x', { sub: '2' });
  expect(sent).toEqual([[3, 'comment_reply', 'x', 2]]);
  sent.length = 0;
  await addComment(post({ anchorId: 'a', text: 'ok' }), 'x', { sub: '2' });
  expect(sent).toEqual([[1, 'comment', 'x', 2]]);
  sent.length = 0;
  await addComment(post({ anchorId: 'a', text: 'ok' }), 'x', { sub: '1' }); // o dono comenta no seu: ninguém
  expect(sent).toEqual([]);
});

test('markRead: com id marca uma, sem id marca todas (só do próprio utilizador)', async () => {
  sent.length = 0;
  await markRead(post({ id: 5 }), { sub: '2' });
  await markRead(post({}), { sub: '2' });
  expect(sent).toEqual([['read', 5, 2], ['readAll', 2]]);
});
