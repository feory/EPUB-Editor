import type { AppNotification } from '../../api/notifications-api';

export function notificationText(n: AppNotification): string {
    const who = n.actor_name ?? n.actor_email ?? 'Alguém';
    const book = n.ebook_title ? `"${n.ebook_title}"` : n.ebook_isbn;
    if (n.type === 'share') return `${who} partilhou ${book} contigo`;
    if (n.type === 'comment_reply') return `${who} respondeu ao teu comentário em ${book}`;
    return `${who} comentou em ${book}`;
}
