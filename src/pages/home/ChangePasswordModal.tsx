import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AxiosError } from 'axios';
import { authApi } from '../../api/auth-api';
import { setAccessToken } from '../../api/client';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../components/ModalCloseButton';
import { MIN_LENGTH, passwordFormError } from './passwordForm';

const serverError = (err: unknown): string => {
    const status = (err as AxiosError).response?.status;
    if (status === 403) return 'A palavra-passe atual está errada.';
    if (status === 429) return 'Demasiadas tentativas. Tenta de novo daqui a pouco.';
    return 'Não foi possível mudar a palavra-passe.';
};

export const ChangePasswordModal: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
    useBodyScrollLock();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const invalid = passwordFormError(current, next, confirm);
        if (invalid) return setError(invalid);
        setBusy(true);
        try {
            const { data } = await authApi.changePassword(current, next);
            setAccessToken(data.accessToken); // sessão nova (as outras terminaram)
            onDone();
        } catch (err) {
            setError(serverError(err));
            setBusy(false);
        }
    };

    const field = (label: string, value: string, set: (v: string) => void, autoComplete: string, autoFocus = false) => (
        <label className="flex flex-col gap-1 text-sm font-medium text-text-main">
            {label}
            <input type="password" value={value} autoComplete={autoComplete} autoFocus={autoFocus}
                onChange={(e) => { set(e.target.value); setError(''); }}
                className="px-3 py-2 rounded-lg border border-border bg-white text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </label>
    );

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <form onSubmit={submit} className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700">Mudar palavra-passe</h2>
                    <ModalCloseButton onClick={onClose} />
                </div>
                <div className="p-6 flex flex-col gap-4">
                    {field('Palavra-passe atual', current, setCurrent, 'current-password', true)}
                    {field('Nova palavra-passe', next, setNext, 'new-password')}
                    {field('Repetir a nova palavra-passe', confirm, setConfirm, 'new-password')}
                    <p className="text-xs text-text-muted">Mínimo de {MIN_LENGTH} caracteres. As sessões noutros dispositivos terminam.</p>
                    {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 h-10 rounded-lg text-sm text-text-muted hover:bg-slate-100">Cancelar</button>
                        <button type="submit" disabled={busy}
                            className="inline-flex items-center gap-2 px-5 h-10 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold disabled:opacity-60">
                            {busy && <Loader2 size={15} className="animate-spin" />} Mudar
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};
