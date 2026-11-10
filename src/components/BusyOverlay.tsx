import React from 'react';
import { Loader2 } from 'lucide-react';

/** Véu com spinner e mensagem para trabalho demorado (importar, processar). `fixed`: cobre a página; senão, o contentor `relative`. */
export const BusyOverlay: React.FC<{ message: string; detail?: string; fixed?: boolean }> = ({ message, detail, fixed }) => (
    <div role="status" aria-live="polite" className={`${fixed ? 'fixed' : 'absolute'} inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center ${fixed ? '' : 'rounded-2xl'}`}>
        <div className="flex flex-col items-center gap-3 px-6 text-center">
            <Loader2 size={32} className="animate-spin text-primary" />
            <p className="text-sm font-semibold text-slate-600">{message}</p>
            {detail && <p className="text-xs text-slate-500">{detail}</p>}
        </div>
    </div>
);
