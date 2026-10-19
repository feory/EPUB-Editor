import apiClient from './client';

export type NotificationType = 'share' | 'comment_reply' | 'comment';

export interface AppNotification {
    id: number;
    type: NotificationType;
    ebook_isbn: string;
    ebook_title: string | null;
    actor_email: string | null;
    actor_name: string | null;
    read_at: string | null;
    created_at: string;
}

export interface NotificationsResponse { notifications: AppNotification[]; unread: number }

export const notificationsApi = {
    list: () => apiClient.get<NotificationsResponse>('/notifications'),
    /** Sem id marca todas como lidas. */
    markRead: (id?: number) => apiClient.post<NotificationsResponse>('/notifications/read', { id }),
};
