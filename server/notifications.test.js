import { test, expect } from 'bun:test';
import { stmt } from './database.js';
import { notify, markRead, listNotifications } from './routes/notifications.js';
import { addComment } from './routes/comments.js';
import { shareEbook } from './routes/ebooks.js';
import { makeUser, makeEbook, post } from './test-helpers.js';

// SQL real, base em memória (test-setup.js).
const owner = makeUser();
const ana = makeUser({ first: 'Ana', last: 'Silva' });
const isbn = makeEbook(owner);
const inbox = (u) => stmt.listNotifications.all(u.id);

test('notify: nunca avisa o próprio nem destinatário vazio', () => {
  notify(ana.id, 'share', isbn, ana.id);
  notify(undefined, 'share', isbn, ana.id);
  expect(inbox(ana)).toEqual([]);
});

test('partilhar avisa quem recebe, com o nome de quem partilhou', async () => {
  await shareEbook(post({ userId: ana.id }), isbn, owner);
  const [n] = inbox(ana);
  expect(n).toMatchObject({ type: 'share', ebook_isbn: isbn, actor_email: owner.email, actor_name: owner.email });
});

test('comentários: novo avisa o dono; resposta avisa quem abriu a thread; o dono a comentar no seu: ninguém', async () => {
  const root = await (await addComment(post({ anchorId: 'a', text: 'Olá' }), isbn, ana)).json();
  expect(inbox(owner).map(n => [n.type, n.actor_name])).toEqual([['comment', 'Ana Silva']]);

  await addComment(post({ anchorId: 'a', parentId: root.comment.id, text: 'Resposta' }), isbn, owner);
  expect(inbox(ana).map(n => n.type)).toContain('comment_reply');

  const before = inbox(owner).length;
  await addComment(post({ anchorId: 'b', text: 'Nota minha' }), isbn, owner);
  expect(inbox(owner).length).toBe(before);
});

test('markRead: um desaparece da lista; sem id desaparecem todos; só os do próprio', async () => {
  const target = makeUser();
  notify(target.id, 'share', isbn, owner.id);
  notify(target.id, 'comment', isbn, owner.id);
  const [first] = inbox(target);
  await markRead(post({ id: first.id }), makeUser()); // outro utilizador: não apaga
  expect(inbox(target).length).toBe(2);
  const res = await (await markRead(post({ id: first.id }), target)).json();
  expect(res.notifications.length).toBe(1);
  expect(res.unread).toBe(1);
  await markRead(post({}), target);
  expect((await listNotifications(target).json()).notifications).toEqual([]);
});
