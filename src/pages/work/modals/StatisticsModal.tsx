import React from 'react';
import { Info } from 'lucide-react';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';


interface StatisticsModalProps {
    stats: { words: number; chars: number; chapterCount: number; estimatedPages: number };
    onClose: () => void;
}

const StatisticsModalComponent: React.FC<StatisticsModalProps> = ({ stats, onClose }) => {
    useBodyScrollLock();
    const data = [
        { label: 'Palavras', value: stats.words.toLocaleString() },
        { label: 'Caracteres', value: stats.chars.toLocaleString() },
        { label: (
            <span className="relative group inline-flex items-center gap-1">
                Páginas Est.
                <Info size={12} className="text-text-muted group-hover:text-slate-700 transition-colors" />
                <span className="absolute left-full bottom-full mb-1 ml-1 w-48 p-2 rounded-lg bg-slate-700 text-white text-[10px] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                    Estimativa baseada em 250 palavras por página
                </span>
            </span>
        ), value: stats.estimatedPages.toString() },
        { label: 'Capítulos', value: stats.chapterCount.toString() },
    ];

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-slate-700">
                        Estatísticas
                    </h2>
                </div>

                <div className="p-6 grid grid-cols-2 gap-4">
                    {data.map((item, i) => (
                        <div key={i} className="p-4 rounded-2xl border border-border bg-slate-50/50 flex flex-col gap-3 text-center">
                            <div>
                                <div className="text-2xl font-black text-slate-700">{item.value}</div>
                                <div className="text-xs font-bold text-text-muted uppercase tracking-wider">{item.label}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 bg-slate-50 border-t border-border">
                    <button
                        className="w-full py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-sm active:scale-95"
                        onClick={onClose}
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export const StatisticsModal = React.memo(StatisticsModalComponent);
