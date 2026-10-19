import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordInput({ value, onChange, required = false, placeholder = '••••••••••••' }: {
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
            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-color">
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
        </div>
    );
}
