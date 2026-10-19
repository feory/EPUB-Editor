import React, { useState } from 'react';
import { Info } from 'lucide-react';
import type { AxiosError } from 'axios';
import { authApi, type AuthUser } from '../../api/auth-api';
import { setAccessToken } from '../../api/client';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../components/ModalCloseButton';
import { PasswordInput } from '../../components/PasswordInput';
import { passwordFormError } from './passwordForm';

interface AccountModalProps {
    user: AuthUser;
    onClose: () => void;
    onSaved: (user: AuthUser) => void;
}

const fieldClass = 'w-full px-4 py-2.5 rounded-xl border border-border focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all';
const labelClass = 'text-sm font-bold text-text-main ml-1';

const passwordError = (err: unknown): string => {
    const status = (err as AxiosError).response?.status;
    if (status === 403) return 'A password atual está errada.';
    if (status === 429) return 'Demasiadas tentativas. Tenta de novo daqui a pouco.';
    return 'Não foi possível guardar.';
};

/** "A minha conta": mesmo aspeto do "Edição do Utilizador" do Painel — nome, email (só leitura) e nova password. */
export const AccountModal: React.FC<AccountModalProps> = ({ user, onClose, onSaved }) => {
    useBodyScrollLock();
    const [firstName, setFirstName] = useState(user.first_name ?? '');
    const [lastName, setLastName] = useState(user.last_name ?? '');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const nameChanged = firstName !== (user.first_name ?? '') || lastName !== (user.last_name ?? '');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (newPassword) {
            const invalid = passwordFormError(currentPassword, newPassword);
            if (invalid) return setError(invalid);
        }
        setBusy(true);
        try {
            // Password primeiro: se a atual estiver errada, nada é gravado.
            if (newPassword) {
                const { data } = await authApi.changePassword(currentPassword, newPassword);
                setAccessToken(data.accessToken); // sessão nova (as outras terminaram)
            }
            const saved = nameChanged ? (await authApi.updateProfile(firstName, lastName)).data.data : user;
            onSaved(saved);
        } catch (err) {
            setError(passwordError(err));
            setBusy(false);
        }
    };

    const clearError = () => setError('');

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <form onSubmit={submit} className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-slate-700">A minha conta</h2>
                    <ModalCloseButton onClick={onClose} />
                </div>
                <div className="p-6 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5 min-w-0">
                            <label className={labelClass}>Nome</label>
                            <input value={firstName} maxLength={60} autoFocus autoComplete="given-name"
                                onChange={e => { setFirstName(e.target.value); clearError(); }} className={fieldClass} />
                        </div>
                        <div className="flex flex-col gap-1.5 min-w-0">
                            <label className={labelClass}>Apelido</label>
                            <input value={lastName} maxLength={60} autoComplete="family-name"
                                onChange={e => { setLastName(e.target.value); clearError(); }} className={fieldClass} />
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className={labelClass}>Email</label>
                        <input value={user.email} disabled readOnly className={`${fieldClass} bg-slate-50 text-text-muted`} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className={`${labelClass} flex items-center gap-1.5`}>
                            Nova Password
                            <span className="group relative inline-flex cursor-help">
                                <Info size={13} className="text-slate-400" />
                                <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 w-56 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                                    Se deixares o campo vazio, a password mantém-se.
                                </span>
                            </span>
                        </label>
                        <PasswordInput value={newPassword} onChange={v => { setNewPassword(v); clearError(); }}
                            placeholder="Nova password (mín. 12 caracteres)" />
                    </div>
                    {newPassword && (
                        <div className="flex flex-col gap-1.5">
                            <label className={labelClass}>Password atual</label>
                            <PasswordInput value={currentPassword} onChange={v => { setCurrentPassword(v); clearError(); }} placeholder="Password atual" />
                        </div>
                    )}
                    {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
                </div>
                <div className="p-6 border-t border-border bg-slate-50/50 flex gap-3 justify-end">
                    <button type="button" onClick={onClose}
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all shadow-sm active:scale-95">
                        Cancelar
                    </button>
                    <button type="submit" disabled={busy}
                        className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-60">
                        Guardar
                    </button>
                </div>
            </form>
        </div>
    );
};
