import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Loader2, UserPlus, Trash2, Shield, User, ChevronLeft, Eye, EyeOff, Pencil, X, Check, Save, Search, Info } from 'lucide-react';
import { authApi, type AuthUser } from '../api/auth-api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Pagination } from '../components/Pagination';
import { ModalCloseButton } from '../components/ModalCloseButton';

const PAGE_SIZE = 10;

const EMPTY_CREATE = { email: '', password: '', role: 'user' as 'admin' | 'user' };

function PasswordInput({ value, onChange, required = false, placeholder = '••••••••••••' }: {
  value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        required={required}
        minLength={required ? 12 : undefined}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-4 py-2.5 pr-10 rounded-xl border border-border focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all"
        placeholder={placeholder}
      />
      <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-color">
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function Modal({ title, onClose, onSave, children }: { title: string; onClose: () => void; onSave?: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-slate-700">{title}</h2>
          <div className="flex items-center gap-1">
            {onSave && (
              <button onClick={onSave} title="Guardar"
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all">
                <Save size={20} />
              </button>
            )}
            <ModalCloseButton onClick={onClose} />
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function AdminPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { showNotification } = useNotification();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);

  const [editTarget, setEditTarget] = useState<AuthUser | null>(null);
  const [editForm, setEditForm] = useState({ email: '', password: '', role: 'user' as 'admin' | 'user' });

  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const editFormRef = useRef<HTMLFormElement>(null);
  const createFormRef = useRef<HTMLFormElement>(null);

  // Clicar fora colapsa a pesquisa (só quando vazia — não destrói um filtro ativo)
  useEffect(() => {
    if (!searchOpen) return;
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node) && !query) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [searchOpen, query]);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => (await authApi.listUsers()).data.data,
  });

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u: AuthUser) =>
      u.email.toLowerCase().includes(q) ||
      (u.role === 'admin' ? 'administrador' : 'utilizador').includes(q)
    );
  }, [users, query]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleQueryChange(value: string) { setQuery(value); setPage(1); }

  const createMutation = useMutation({
    mutationFn: () => authApi.createUser(createForm.email, createForm.password, createForm.role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setCreateForm(EMPTY_CREATE);
      setShowCreate(false);
      showNotification('success', 'Utilizador criado com sucesso.');
    },
    onError: (err: AxiosError<{ error: string }>) => {
      showNotification('error', err?.response?.data?.error ?? 'Erro ao criar utilizador.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const data: { email?: string; password?: string; role?: 'admin' | 'user' } = {};
      if (editForm.email !== editTarget?.email) data.email = editForm.email;
      if (editForm.password) data.password = editForm.password;
      if (editForm.role !== editTarget?.role) data.role = editForm.role;
      return authApi.updateUser(editTarget!.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditTarget(null);
      showNotification('success', 'Utilizador atualizado.');
    },
    onError: (err: AxiosError<{ error: string }>) => {
      showNotification('error', err?.response?.data?.error ?? 'Erro ao atualizar utilizador.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => authApi.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      showNotification('success', 'Utilizador eliminado.');
    },
    onError: (err: AxiosError<{ error: string }>) => {
      showNotification('error', err?.response?.data?.error ?? 'Erro ao eliminar utilizador.');
    },
    onSettled: () => setConfirmDelete(null),
  });

  function openEdit(u: AuthUser) {
    setEditTarget(u);
    setEditForm({ email: u.email, password: '', role: u.role });
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const fieldClass = "w-full px-4 py-2.5 rounded-xl border border-border focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all";
  const labelClass = "text-sm font-bold text-text-main ml-1";

  return (
    <div className="min-h-screen bg-bg-color px-4 py-8">
      <div className="max-w-3xl mx-auto flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')}
              className="p-2 rounded-lg hover:bg-card-bg border border-transparent hover:border-border transition-colors">
              <ChevronLeft size={18} className="text-text-muted" />
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-700">Gestão de Utilizadores</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 h-10 rounded-lg font-semibold text-sm transition-all shadow-sm"
            >
              <UserPlus size={14} />
              Novo Utilizador
            </button>
          </div>
        </div>

        {/* Users list */}
        <div className="bg-card-bg border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-slate-700">
              Utilizadores {!isLoading && <span className="text-text-muted font-normal">({filteredUsers.length})</span>}
            </h2>
            {users.length > 0 && (
              searchOpen ? (
                <div ref={searchRef} className="relative w-56 animate-in fade-in slide-in-from-right-2 duration-200">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Email ou role..."
                    value={query}
                    onChange={e => handleQueryChange(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { handleQueryChange(''); setSearchOpen(false); } }}
                    className="w-full pl-8 pr-3 h-9 rounded-lg border border-border bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
                  />
                </div>
              ) : (
                <button onClick={() => setSearchOpen(true)} className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-200 text-text-muted transition-all shrink-0" title="Pesquisar">
                  <Search size={16} />
                </button>
              )
            )}
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-slate-500" />
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-text-muted">Nenhum utilizador encontrado.</div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-text-muted">Nenhum resultado para "{query}".</div>
          ) : (
            <div className="divide-y divide-border">
              {pageUsers.map((u: AuthUser) => (
                <div key={u.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-1.5 rounded-lg ${u.role === 'admin' ? 'bg-slate-100' : 'bg-card-bg border border-border'}`}>
                      {u.role === 'admin' ? <Shield size={14} className="text-slate-500" /> : <User size={14} className="text-text-muted" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-color truncate">{u.email}</p>
                      <p className="text-xs text-text-muted">
                        {u.role === 'admin' ? 'Administrador' : 'Utilizador'}
                        {u.created_at && ` · ${formatDate(u.created_at)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmDelete !== u.id && (
                      <button onClick={() => openEdit(u)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-slate-700 hover:bg-slate-100
                                   border border-transparent hover:border-slate-300 transition-colors">
                        <Pencil size={14} />
                      </button>
                    )}
                    {u.id !== currentUser?.id && u.role !== 'admin' && (
                      confirmDelete === u.id ? (
                        <div className="flex items-center gap-1 animate-in fade-in duration-150">
                          <button onClick={() => deleteMutation.mutate(u.id)} disabled={deleteMutation.isPending}
                            className="p-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
                            title="Confirmar eliminação">
                            {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                          <button onClick={() => setConfirmDelete(null)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                            title="Cancelar">
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(u.id)}
                          className="p-1.5 rounded-lg border border-border text-text-muted hover:border-rose-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
                          title="Eliminar utilizador">
                          <Trash2 size={14} />
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal title="Novo Utilizador" onClose={() => { setShowCreate(false); setCreateForm(EMPTY_CREATE); }} onSave={() => createFormRef.current?.requestSubmit()}>
          <form ref={createFormRef} onSubmit={e => { e.preventDefault(); createMutation.mutate(); }} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Email</label>
              <input type="email" required value={createForm.email}
                onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                className={fieldClass} placeholder="utilizador@exemplo.com" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Role</label>
              <select value={createForm.role}
                onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as 'admin' | 'user' }))}
                className={fieldClass}>
                <option value="user">Utilizador</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Password <span className="normal-case text-text-muted">(mín. 12 caracteres)</span></label>
              <PasswordInput value={createForm.password} onChange={v => setCreateForm(f => ({ ...f, password: v }))} required />
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal title="Edição do Utilizador" onClose={() => setEditTarget(null)} onSave={() => editFormRef.current?.requestSubmit()}>
          <form ref={editFormRef} onSubmit={e => { e.preventDefault(); updateMutation.mutate(); }} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Email</label>
              <input type="email" required value={editForm.email}
                onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                className={fieldClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Role</label>
              <select value={editForm.role}
                onChange={e => setEditForm(f => ({ ...f, role: e.target.value as 'admin' | 'user' }))}
                className={fieldClass}
                disabled={editTarget.id === currentUser?.id}>
                <option value="user">Utilizador</option>
                <option value="admin">Administrador</option>
              </select>
              {editTarget.id === currentUser?.id && (
                <p className="text-xs text-text-muted">Não podes alterar o teu próprio role.</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={`${labelClass} flex items-center gap-1.5`}>
                Nova Password
                <span className="group relative inline-flex cursor-help">
                  <Info size={13} className="text-slate-400" />
                  <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 w-56 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                    Se deixar o campo vazio, a senha mantém.
                  </span>
                </span>
              </label>
              <PasswordInput value={editForm.password} onChange={v => setEditForm(f => ({ ...f, password: v }))}
                placeholder="Nova password (mín. 12 caracteres)" />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
