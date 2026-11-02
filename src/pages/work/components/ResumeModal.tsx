import React from 'react';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';

interface ResumeModalProps {
    chapterTitle: string;
    onResume: () => void;
    onDismiss: () => void;
}

// Ao reabrir o ebook: continuar no último sítio do cursor ou começar do início.
export const ResumeModal: React.FC<ResumeModalProps> = ({ chapterTitle, onResume, onDismiss }) => {
    useBodyScrollLock();
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onKeyDown={(e) => { if (e.key === 'Escape') onDismiss(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="resume-title" className="bg-white rounded-2xl shadow-xl w-[420px] max-w-[90vw] p-6 flex flex-col gap-4">
                <h2 id="resume-title" className="text-lg font-bold text-slate-800">Continuar a trabalhar neste projeto?</h2>
                <p className="text-sm text-slate-600">Ficaste em «{chapterTitle}». Queres voltar ao último sítio onde estavas?</p>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onDismiss} className="h-9 px-4 rounded-lg border border-border text-sm hover:bg-slate-50">Começar do início</button>
                    <button type="button" autoFocus onClick={onResume} className="h-9 px-4 rounded-lg bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800">Continuar</button>
                </div>
            </div>
        </div>
    );
};
