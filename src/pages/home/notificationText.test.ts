import { test, expect } from 'bun:test';
import { notificationText } from './notificationText';
import type { AppNotification } from '../../api/notifications-api';

const n = (type: AppNotification['type'], over: Partial<AppNotification> = {}): AppNotification =>
    ({ id: 1, type, ebook_isbn: '978', ebook_title: 'Hamlet', actor_email: 'ana@x.pt', read_at: null, created_at: '2026-10-19 10:00:00', ...over });

test('notificationText: um texto por tipo, com fallback sem título/autor', () => {
    expect(notificationText(n('share'))).toBe('ana@x.pt partilhou "Hamlet" contigo');
    expect(notificationText(n('comment_reply'))).toBe('ana@x.pt respondeu ao teu comentário em "Hamlet"');
    expect(notificationText(n('comment', { ebook_title: null, actor_email: null }))).toBe('Alguém comentou em 978');
});
