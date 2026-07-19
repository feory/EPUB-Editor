import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        const retryAfter = err.response.headers?.['retry-after'];
        const minutes = retryAfter ? Math.ceil(Number(retryAfter) / 60) : 15;
        setError(`Demasiadas tentativas. Tente novamente em ${minutes} min.`);
      } else if (status === 401) {
        setError('Email ou password incorretos.');
      } else {
        setError('Erro de ligação ao servidor.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-color px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 gap-3">
          <h1 className="text-2xl font-bold text-slate-700">Almedina EPUB</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card-bg border border-border rounded-2xl p-8 shadow-sm flex flex-col gap-5"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-bg-color text-text-color text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary
                         placeholder:text-text-muted"
              placeholder="utilizador@exemplo.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-border bg-bg-color text-text-color text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary
                           placeholder:text-text-muted"
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-color"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-500">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                       bg-slate-700 text-white font-medium text-sm
                       hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {isLoading && <Loader2 size={16} className="animate-spin" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
