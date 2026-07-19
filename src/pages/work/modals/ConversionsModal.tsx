import React, { useState } from 'react';
import { Info } from 'lucide-react';
import type { ImportOptions } from '../../../utils/html-cleaner';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';
import { CONVERSION_OPTIONS } from './conversionOptions';

interface ConversionsModalProps {
    onApply: (options: ImportOptions) => void;
    onClose: () => void;
}

const ConversionsModalComponent: React.FC<ConversionsModalProps> = ({ onApply, onClose }) => {
    useBodyScrollLock();
    const [options, setOptions] = useState<ImportOptions>({
        indentAllParagraphs: false,
        topOnBoldParagraphs: false,
        noIndentAfterBold: false,
        wrapBoldWithNext: false,
        convertListsToDialogue: false,
    });

    const toggle = (key: keyof ImportOptions) => setOptions(prev => ({ ...prev, [key]: !prev[key] }));
    const anySelected = CONVERSION_OPTIONS.some(o => options[o.key]);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        Conversões
                    </h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                <div className="p-6 flex flex-col gap-4">
                    <p className="text-sm text-text-muted">
                        Aplicar conversões ao capítulo atual.
                    </p>

                    {CONVERSION_OPTIONS.map(({ key, label, description }) => (
                        <label key={key} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-slate-50/50 cursor-pointer hover:border-slate-700 transition-colors">
                            <input
                                type="checkbox"
                                checked={options[key]}
                                onChange={() => toggle(key)}
                                className="mt-0.5 accent-slate-700"
                            />
                            <span className="text-sm text-slate-700 flex-1">{label}</span>
                            <span className="relative group shrink-0">
                                <Info size={16} className="text-text-muted hover:text-primary transition-colors" />
                                <span className="absolute right-0 bottom-full mb-2 w-64 p-2.5 rounded-lg bg-slate-900 text-white text-xs leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                                    {description}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>

                <div className="p-6 bg-slate-50 border-t border-border flex gap-3">
                    <button
                        className="flex-1 py-3 border border-border text-slate-700 rounded-xl font-bold transition-all hover:bg-slate-100 active:scale-95"
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button
                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!anySelected}
                        onClick={() => { onApply(options); onClose(); }}
                    >
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ConversionsModal = React.memo(ConversionsModalComponent);
