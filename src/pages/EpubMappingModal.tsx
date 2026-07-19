import React, { useState } from 'react';
import { FileUp } from 'lucide-react';
import type { EpubClassInfo } from '../services/epub-importer';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../components/ModalCloseButton';

interface EpubMappingModalProps {
    fileName: string;
    classes: EpubClassInfo[];
    onConfirm: (mapping: Record<string, string>) => void;
    onClose: () => void;
}

// Subconjunto curado de NEW_CLASSES + Manter/Remover. Valores = alvos que adaptLegacyClasses aceita.
const TARGET_OPTIONS: { value: string; label: string }[] = [
    { value: '__keep__', label: 'Manter' },
    { value: 'h1', label: 'Título 1' },
    { value: 'h2', label: 'Título 2' },
    { value: 'h3', label: 'Título 3' },
    { value: 'p-indent', label: 'Com indentação' },
    { value: 'p-non-indent', label: 'Sem indentação' },
    { value: 'p-top', label: 'Espaço acima' },
    { value: 'p-small', label: 'Pequeno' },
    { value: 'p-center', label: 'Centrado' },
    { value: 'p-quote', label: 'Citação' },
    { value: 'p-bold', label: 'Negrito' },
    { value: 'p-italic', label: 'Itálico' },
    { value: 'p-bold-italic', label: 'Negrito + Itálico' },
    { value: 'p-legendas', label: 'Legenda' },
    { value: 'footnote', label: 'Nota de rodapé' },
    { value: '__drop__', label: 'Remover' },
];

const EpubMappingModalComponent: React.FC<EpubMappingModalProps> = ({ fileName, classes, onConfirm, onClose }) => {
    useBodyScrollLock();
    const [mapping, setMapping] = useState<Record<string, string>>(
        () => Object.fromEntries(classes.map(c => [c.name, c.suggested])),
    );
    const setTarget = (name: string, target: string) => setMapping(prev => ({ ...prev, [name]: target }));
    const displayName = (name: string) => /^h[1-3]$/.test(name) ? `Título ${name[1]} (${name})` : name;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        <FileUp size={20} />
                        Mapeamento de Estilos
                    </h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                <div className="p-6 flex flex-col gap-4">
                    <p className="text-sm text-text-muted">
                        Importar <span className="font-bold text-text-main">{fileName}</span>. Escolha para que estilo do editor mapear cada classe do EPUB antigo.
                    </p>

                    <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                        {classes.map(c => {
                            const value = mapping[c.name] ?? c.suggested;
                            // Alvo sugerido pode ser combinado (ex. "p-center p-bold") e não estar na lista → mostrar como opção extra.
                            const hasOption = TARGET_OPTIONS.some(o => o.value === value);
                            return (
                                <div key={c.name} className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-slate-50/50">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-text-main truncate">{displayName(c.name)}</span>
                                            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-slate-200 text-text-muted">{c.count}</span>
                                        </div>
                                        {c.sample && <p className="text-xs text-text-muted truncate">{c.sample}</p>}
                                    </div>
                                    <select
                                        value={value}
                                        onChange={e => setTarget(c.name, e.target.value)}
                                        className="shrink-0 text-sm rounded-lg border border-border bg-white px-2 py-1.5 text-text-main"
                                    >
                                        {!hasOption && <option value={value}>{value}</option>}
                                        {TARGET_OPTIONS.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-border flex gap-3">
                    <button
                        className="flex-1 py-3 border border-border text-text-main rounded-xl font-bold transition-all hover:bg-slate-100 active:scale-95"
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button
                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-md active:scale-95"
                        onClick={() => onConfirm(mapping)}
                    >
                        Importar
                    </button>
                </div>
            </div>
        </div>
    );
};

export const EpubMappingModal = React.memo(EpubMappingModalComponent);
