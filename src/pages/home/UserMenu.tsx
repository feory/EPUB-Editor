import React, { useEffect, useRef, useState } from 'react';
import { LogOut, Shield, Table2, LayoutGrid, Trash2, Loader2 } from 'lucide-react';
import type { AuthUser } from '../../api/auth-api';

type ViewMode = 'table' | 'grid';

interface UserMenuProps {
    user: AuthUser;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    onLogout: () => void;
    onCleanupHistory: () => void;
    cleanupPending: boolean;
    onNavigateAdmin: () => void;
}

function getInitials(email: string): string {
    const local = email.split('@')[0];
    const parts = local.split('.');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
}

const VIEW_MODES: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'table', icon: <Table2 size={15} />, label: 'Tabela' },
    { mode: 'grid', icon: <LayoutGrid size={15} />, label: 'Grelha' },
];

export const UserMenu: React.FC<UserMenuProps> = ({
    user, viewMode, onViewModeChange, onLogout, onCleanupHistory, cleanupPending, onNavigateAdmin,
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const initials = getInitials(user.email);

    return (
        <div ref={ref} className="relative">
            {/* Avatar */}
            <button
                onClick={() => setOpen(prev => !prev)}
                title={user.email}
                className="w-9 h-9 rounded-full bg-slate-200 text-slate-600 text-sm font-bold flex items-center justify-center hover:bg-slate-300 transition-colors select-none"
            >
                {initials}
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 bg-white border border-border rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* User header */}
                    <div className="px-4 py-3 border-b border-border bg-slate-50">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                                {initials}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-text-main truncate">{user.email}</p>
                                <p className="text-xs text-text-muted capitalize">{user.role}</p>
                            </div>
                        </div>
                    </div>

                    {/* View mode */}
                    <div className="px-4 py-3 border-b border-border">
                        <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Visualização</p>
                        <div className="flex gap-1">
                            {VIEW_MODES.map(({ mode, icon, label }) => (
                                <button
                                    key={mode}
                                    title={label}
                                    onClick={() => { onViewModeChange(mode); }}
                                    className={`flex-1 h-8 flex items-center justify-center rounded-lg border transition-all ${viewMode === mode ? 'bg-slate-200 text-slate-700 border-slate-300' : 'border-border text-text-muted hover:bg-slate-100'}`}
                                >
                                    {icon}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Admin section */}
                    {user.role === 'admin' && (
                        <div className="border-b border-border">
                            <button
                                onClick={() => { setOpen(false); onNavigateAdmin(); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:bg-slate-50 hover:text-text-main transition-colors"
                            >
                                <Shield size={15} />
                                <span>Gestão de Utilizadores</span>
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm('Remover permanentemente todos os rascunhos com mais de 7 dias?')) {
                                        onCleanupHistory();
                                        setOpen(false);
                                    }
                                }}
                                disabled={cleanupPending}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:bg-slate-50 hover:text-rose-600 transition-colors disabled:opacity-50"
                            >
                                {cleanupPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                <span>Limpar Histórico</span>
                            </button>
                        </div>
                    )}

                    {/* Logout */}
                    <button
                        onClick={() => { setOpen(false); onLogout(); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-muted hover:bg-slate-50 hover:text-rose-600 transition-colors"
                    >
                        <LogOut size={15} />
                        <span>Terminar Sessão</span>
                    </button>
                </div>
            )}
        </div>
    );
};
