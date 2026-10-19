import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../api/notifications-api';
import { notificationText } from './notificationText';

const POLL_MS = 30_000;

// created_at vem do SQLite em UTC sem fuso ("YYYY-MM-DD HH:MM:SS").
const when = (ts: string) => new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });

export const NotificationsBell: React.FC<{ onOpenEbook: (isbn: string) => void }> = ({ onOpenEbook }) => {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const { data } = useQuery({
        queryKey: ['notifications'],
        queryFn: async () => (await notificationsApi.list()).data,
        refetchInterval: POLL_MS,
    });
    const unread = data?.unread ?? 0;

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const markRead = async (id?: number) => {
        try { queryClient.setQueryData(['notifications'], (await notificationsApi.markRead(id)).data); } catch { /* o próximo poll refaz */ }
    };

    return (
        <div ref={ref} className="relative">
            <button onClick={() => setOpen(o => !o)} title="Avisos" aria-label={unread ? `Avisos (${unread} por ler)` : 'Avisos'}
                className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-200 text-text-muted transition-all">
                <Bell size={17} />
                {unread > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 bg-white border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-slate-50">
                        <p className="text-xs font-bold text-text-muted uppercase tracking-wider">Avisos</p>
                        {unread > 0 && <button onClick={() => markRead()} className="text-xs text-primary hover:underline">Marcar como lidos</button>}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {(data?.notifications.length ?? 0) === 0 ? (
                            <p className="px-4 py-8 text-center text-sm text-text-muted italic">Sem avisos.</p>
                        ) : data!.notifications.map(n => (
                            <button key={n.id} onClick={() => { if (!n.read_at) void markRead(n.id); setOpen(false); onOpenEbook(n.ebook_isbn); }}
                                className={`w-full text-left px-4 py-2.5 border-b border-border last:border-0 hover:bg-slate-50 transition-colors ${n.read_at ? '' : 'bg-primary/5'}`}>
                                <p className={`text-sm ${n.read_at ? 'text-text-muted' : 'text-text-main font-medium'}`}>{notificationText(n)}</p>
                                <p className="text-[11px] text-text-muted mt-0.5">{when(n.created_at)}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
