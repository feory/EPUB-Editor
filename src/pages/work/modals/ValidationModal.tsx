import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { ValidationResult } from '../../../api/ebooks-api';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';
import type { ValidationReport } from '../../../services/footnote-validator';
import { ValidationContent } from '../components/ValidationContent';

interface ValidationModalProps {
    results: ValidationResult | null;
    footnoteResults: ValidationReport | null;
    onClose: () => void;
    onGoToIssue?: (context: string) => void;
}

const ValidationModalComponent: React.FC<ValidationModalProps> = ({ results, footnoteResults, onClose, onGoToIssue }) => {
    useBodyScrollLock();
    const handleGoToIssue = (context: string) => {
        if (onGoToIssue) {
            onGoToIssue(context);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-3">
                        {(!results || results.valid) && (!footnoteResults || footnoteResults.issues.length === 0) ?
                            <CheckCircle2 size={24} className="text-emerald-500" /> :
                            <AlertCircle size={24} className="text-rose-500" />
                        }
                        Relatório de Validação
                    </h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                <div className="overflow-y-auto p-6">
                    <ValidationContent
                        results={results}
                        footnoteResults={footnoteResults}
                        onGoToIssue={handleGoToIssue}
                        variant="modal"
                    />
                </div>

                <div className="p-6 border-t border-border bg-slate-50/50 flex justify-end">
                    <button
                        className="px-8 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-bold transition-all shadow-md active:scale-95"
                        onClick={onClose}
                    >
                        Fechar Relatório
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ValidationModal = React.memo(ValidationModalComponent);
