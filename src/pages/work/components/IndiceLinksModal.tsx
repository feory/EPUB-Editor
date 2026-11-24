import React, { useState } from 'react';
import { BookMarked } from 'lucide-react';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';
import { DEFAULT_SUBTITLE_STYLES } from '../../../utils/indice-links';

interface Props {
    isbn: string;
    styles: { cls: string; count: number }[];   // classes de parágrafo usadas no livro
    onConfirm: (subtitleStyles: string[]) => void;
    onClose: () => void;
}

const storeKey = (isbn: string) => `indice-subtitle-styles:${isbn}`;

/** A escolha anterior deste livro (só as classes que ainda existem); sem escolha, os estilos de sempre que o livro tenha. */
function initialSelection(isbn: string, styles: Props['styles']): Set<string> {
    const present = new Set(styles.map((s) => s.cls));
    try {
        const saved = JSON.parse(localStorage.getItem(storeKey(isbn)) ?? 'null');
        if (Array.isArray(saved)) return new Set(saved.filter((c: unknown): c is string => typeof c === 'string' && present.has(c)));
    } catch { /* sem localStorage: usa o por omissão */ }
    return new Set(DEFAULT_SUBTITLE_STYLES.filter((c) => present.has(c)));
}

/** "Criação Links Índice": o utilizador diz que estilos de parágrafo são subtítulos (as entradas do Índice sem capítulo próprio ligam-se a eles). */
export const IndiceLinksModal: React.FC<Props> = ({ isbn, styles, onConfirm, onClose }) => {
    useBodyScrollLock();
    const [selected, setSelected] = useState(() => initialSelection(isbn, styles));
    const toggle = (cls: string) => setSelected((prev) => { const next = new Set(prev); if (!next.delete(cls)) next.add(cls); return next; });
    const confirm = () => {
        const chosen = styles.map((s) => s.cls).filter((c) => selected.has(c));
        try { localStorage.setItem(storeKey(isbn), JSON.stringify(chosen)); } catch { /* sem localStorage: só não lembra */ }
        onConfirm(chosen);
        onClose();
    };
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2"><BookMarked size={18} className="text-slate-500" />Criação Links Índice</h2>
                    <ModalCloseButton onClick={onClose} />
                </div>
                <div className="p-6 pb-3 text-sm text-slate-600">
                    Que estilos de parágrafo são <b>subtítulos</b>? As entradas do Índice que não são um capítulo ligam-se a parágrafos com estes estilos. Os títulos (h1, h2, h3) contam sempre.
                </div>
                <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-1">
                    {styles.length === 0 && <p className="text-sm text-slate-400">Este livro não tem parágrafos com estilo.</p>}
                    {styles.map(({ cls, count }) => (
                        <label key={cls} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-100 cursor-pointer text-sm text-slate-700">
                            <input type="checkbox" checked={selected.has(cls)} onChange={() => toggle(cls)} />
                            <span className="font-mono">{cls}</span>
                            <span className="ml-auto text-xs text-slate-400">{count}</span>
                        </label>
                    ))}
                </div>
                <div className="flex justify-end gap-2 p-4 border-t border-border">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
                    <button onClick={confirm} className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-white hover:bg-slate-700">Criar links</button>
                </div>
            </div>
        </div>
    );
};
