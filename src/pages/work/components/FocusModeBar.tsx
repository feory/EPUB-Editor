import React from 'react';
import { Save, Minimize2 } from 'lucide-react';

interface FocusModeBarProps {
    title: string;
    lastSaved: Date | null;
    isLoading: boolean;
    hasContent: boolean;
    onSave: () => void;
    onExit: () => void;
}

export const FocusModeBar: React.FC<FocusModeBarProps> = ({
    lastSaved, isLoading, hasContent, onSave, onExit,
}) => (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white/90 backdrop-blur-md border border-border shadow-lg rounded-2xl px-4 py-2 animate-in fade-in slide-in-from-top-2 duration-300">
        <button
            onClick={onSave}
            disabled={isLoading || !hasContent}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors disabled:opacity-40"
            title="Guardar"
        >
            <Save size={13} />
            <span className="font-mono">
                {lastSaved ? lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Guardar'}
            </span>
        </button>
        <div className="w-px h-4 bg-border" />
        <button
            onClick={onExit}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
            title="Sair do Modo Foco (Esc)"
        >
            <Minimize2 size={13} />
            <span>Sair</span>
        </button>
    </div>
);
