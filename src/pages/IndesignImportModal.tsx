import React, { useMemo, useState } from 'react';
import { AlertTriangle, FileUp, Info, Loader2 } from 'lucide-react';
import type { BookMap } from '../services/indesign/commands';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../components/ModalCloseButton';

interface IndesignImportModalProps {
    fileName: string;
    map: BookMap;
    pending: boolean;
    onConfirm: (map: BookMap, force: boolean) => void;   // force = importar mesmo com erros na verificação
    onClose: () => void;
}

// Alvos do mapa (ver src/services/indesign/translate.ts). "" = automático pelo CSS original.
const PARAGRAPH_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'Automático' },
    { value: 'h1', label: 'Capítulo (h1)' },
    { value: 'h2', label: 'Sub-capítulo (h2)' },
    { value: 'h3', label: 'Subtítulo (h3)' },
    { value: 'p-legendas', label: 'Legenda' },
    { value: 'p-quote', label: 'Citação' },
    { value: 'alinea', label: 'Alínea' },
    { value: 'p-small', label: 'Pequeno' },
    { value: '__remove__', label: 'Remover (apaga o texto)' },
];
const SPAN_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'Sem formatação' },
    { value: 'i', label: 'Itálico' },
    { value: 'b', label: 'Negrito' },
    { value: 'b i', label: 'Negrito + itálico' },
    { value: 'u', label: 'Sublinhado' },
    { value: 'sup', label: 'Elevado' },
    { value: 'sub', label: 'Inferior' },
    { value: 'small-caps', label: 'Versaletes' },
    { value: 'drop-cap', label: 'Capitular' },
    { value: '__remove__', label: 'Remover (apaga o texto)' },
];

// Casos que pedem confirmação humana (no skill, são as perguntas ao utilizador).
const MANY_CHAPTERS = 40;
function doubtOf(key: string, target: string, count: number): string {
    if (target.split(/\s+/).includes('__remove__')) return 'Remove o elemento e o texto — confirmar.';
    if (key.startsWith('p.') && /\bh[12]\b/.test(target) && count >= MANY_CHAPTERS) {
        return `${count} capítulos com este estilo — são mesmo capítulos ou subtítulos (h3)?`;
    }
    return '';
}

const IndesignImportModalComponent: React.FC<IndesignImportModalProps> = ({ fileName, map, pending, onConfirm, onClose }) => {
    useBodyScrollLock();
    const [targets, setTargets] = useState<Record<string, string>>(
        () => Object.fromEntries(Object.entries(map.classes).map(([k, e]) => [k, e.target])),
    );
    const rows = useMemo(() => {
        const all = Object.entries(map.classes).map(([key, e]) => ({ key, e, doubt: doubtOf(key, targets[key] ?? e.target, e.count ?? 0) }));
        return [...all.filter(r => r.doubt), ...all.filter(r => !r.doubt)]; // dúvidas no topo
    }, [map, targets]);
    const doubts = rows.filter(r => r.doubt).length;
    const [force, setForce] = useState(false);

    const confirm = () => onConfirm({
        classes: Object.fromEntries(Object.entries(map.classes).map(([k, e]) => {
            const target = targets[k] ?? e.target;
            return [k, target === e.target ? e : { ...e, target, origem: 'revisto' }];
        })),
    }, force);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={pending ? undefined : onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        <FileUp size={20} />
                        Importação InDesign
                        <span className="group relative inline-flex cursor-help">
                            <Info size={15} className="text-slate-400" />
                            <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 w-72 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                                O EPUB é optimizado para os estilos do editor. Alinhamentos, recuos, espaços e negrito/itálico vêm do CSS original; aqui decide só o que o CSS não diz: títulos, formatação dos caracteres e o que remover.
                            </span>
                        </span>
                    </h2>
                    {!pending && <ModalCloseButton onClick={onClose} />}
                </div>

                <div className="p-6 flex flex-col gap-4">
                    <p className="text-sm text-text-muted">
                        Importar <span className="font-bold text-text-main">{fileName}</span> · {rows.length} estilos.
                    </p>
                    {doubts > 0 && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                            <span>{doubts === 1 ? '1 estilo precisa' : `${doubts} estilos precisam`} de confirmação (no topo da lista).</span>
                        </div>
                    )}

                    <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
                        {rows.map(({ key, e, doubt }) => {
                            const isSpan = key.startsWith('span.');
                            const options = isSpan ? SPAN_OPTIONS : PARAGRAPH_OPTIONS;
                            const value = targets[key] ?? e.target;
                            const hasOption = options.some(o => o.value === value);
                            return (
                                <div key={key} className={`flex items-center gap-3 p-2.5 rounded-xl border ${doubt ? 'border-amber-300 bg-amber-50/60' : 'border-border bg-slate-50/50'}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-text-muted">{isSpan ? 'Carácter' : 'Parágrafo'}</span>
                                            <span className="text-sm font-medium text-text-main truncate">{key.slice(key.indexOf('.') + 1)}</span>
                                            <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-slate-200 text-text-muted">{e.count}</span>
                                        </div>
                                        {e.sample && <p className="text-xs text-text-muted truncate">{e.sample}</p>}
                                        {doubt && <p className="text-xs text-amber-800 mt-0.5">{doubt}</p>}
                                    </div>
                                    <select
                                        value={value}
                                        disabled={pending}
                                        onChange={ev => setTargets(prev => ({ ...prev, [key]: ev.target.value }))}
                                        className="shrink-0 text-sm rounded-lg border border-border bg-white px-2 py-1.5 text-text-main"
                                    >
                                        {!hasOption && <option value={value}>{value}</option>}
                                        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <label className="mx-6 mb-4 flex items-start gap-2 text-sm text-text-muted cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={force}
                        disabled={pending}
                        onChange={ev => setForce(ev.target.checked)}
                        className="mt-0.5 accent-slate-700"
                    />
                    <span>
                        Importação forçada
                        <span className="block text-xs">Se faltar texto, imagens, notas ou quebras de página face ao original, importa na mesma e avisa.</span>
                    </span>
                </label>

                <div className="p-6 bg-slate-50 border-t border-border flex gap-3">
                    <button
                        className="flex-1 py-3 border border-border text-text-main rounded-xl font-bold transition-all hover:bg-slate-100 active:scale-95 disabled:opacity-50"
                        onClick={onClose}
                        disabled={pending}
                    >
                        Cancelar
                    </button>
                    <button
                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-md active:scale-95 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                        onClick={confirm}
                        disabled={pending}
                    >
                        {pending && <Loader2 size={16} className="animate-spin" />}
                        {pending ? 'A optimizar e verificar…' : 'Optimizar e importar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const IndesignImportModal = React.memo(IndesignImportModalComponent);
