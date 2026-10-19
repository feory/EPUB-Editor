import type { AuthUser } from '../../api/auth-api';

/** Iniciais do avatar: "Ana Silva" → AS; sem nome, do email ("ana.silva@x" → AS, "ana@x" → AN). */
export function initialsOf(user: Pick<AuthUser, 'name' | 'email'>): string {
    const words = user.name.trim().split(/\s+/);
    if (user.name !== user.email && words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    const local = user.email.split('@')[0];
    const parts = local.split('.');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
}
