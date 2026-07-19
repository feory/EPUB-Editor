import React, { useState } from 'react';
import { GitCompare, FileUp, History, Save, ChevronRight, Info } from 'lucide-react';
import type { HistoryFile } from '../../../api/ebooks-api';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';

type CompareTab = 'file' | 'history';

interface CompareModalProps {
    files: HistoryFile[];
    formatTimestamp: (ts: string) => string;
    onCompareFile: (file: File) => void;
    onCompareHistory: (file: HistoryFile) => void;
    onClose: () => void;
}

const CompareModalComponent: React.FC<CompareModalProps> = ({ files, formatTimestamp, onCompareFile, onCompareHistory, onClose }) => {
    useBodyScrollLock();
    const [tab, setTab] = useState<CompareTab>('file');
    // Default: só o grupo mais recente (índice 0) aberto; `overrides` guarda apenas o que o
    // utilizador alterou à mão (default derivado do índice → sobrevive ao load async).
    const [overrides, setOverrides] = useState<Record<string, boolean>>({});
    const toggleGroup = (date: string, defCollapsed: boolean) =>
        setOverrides(prev => ({ ...prev, [date]: !(date in prev ? prev[date] : defCollapsed) }));

    // Agrupa saves por dia (files já ordenados do mais recente).
    const groups: { date: string; label: string; files: HistoryFile[] }[] = [];
    for (const file of files) {
        const date = file.timestamp.split('T')[0];
        let group = groups[groups.length - 1];
        if (!group || group.date !== date) {
            let label = date;
            try {
                const d = new Date(`${date}T00:00:00`);
                if (!isNaN(d.getTime())) {
                    label = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                    label = label.charAt(0).toUpperCase() + label.slice(1);
                }
            } catch { /* mantém a data crua */ }
            group = { date, label, files: [] };
            groups.push(group);
        }
        group.files.push(file);
    }

    const tabs: { id: CompareTab; label: string }[] = [
        { id: 'file', label: 'Ficheiro' },
        { id: 'history', label: 'Histórico' },
    ];

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        <GitCompare size={20} className="text-slate-500" />
                        Comparação
                        <span className="group relative inline-flex cursor-help">
                            <Info size={15} className="text-slate-400" />
                            <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 w-64 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                                Comparação do texto do editor com uma versão do histórico.
                            </span>
                        </span>
                    </h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                <div className="flex border-b border-border bg-slate-50/30">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                                tab === t.id ? 'text-slate-700 border-b-2 border-slate-400 bg-white' : 'text-text-muted hover:text-text-main hover:bg-slate-100'
                            }`}
                            onClick={() => setTab(t.id)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {tab === 'file' ? (
                    <div className="p-6 flex-1 flex">
                        <label className="flex-1 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors text-center">
                            <FileUp size={36} className="text-slate-400" />
                            <div>
                                <div className="text-sm font-bold text-slate-700">Carregar ficheiro para comparar</div>
                                <div className="text-xs text-text-muted mt-1">DOCX, DOC, TXT ou PDF — comparado com o editor atual</div>
                            </div>
                            <input
                                type="file"
                                accept=".docx,.doc,.txt,.pdf"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) { onCompareFile(file); onClose(); }
                                    e.target.value = '';
                                }}
                                hidden
                            />
                        </label>
                    </div>
                ) : (
                    <div className="overflow-y-auto px-2 pb-2 flex-1">
                        {files.length === 0 ? (
                            <div className="py-16 text-center text-text-muted italic flex flex-col items-center gap-3">
                                <History size={40} className="text-slate-200" />
                                Sem versões no histórico.
                            </div>
                        ) : (
                            <div className="space-y-5 pt-3">
                                {groups.map((group, index) => {
                                    const defCollapsed = index !== 0;
                                    const isCollapsed = group.date in overrides ? overrides[group.date] : defCollapsed;
                                    return (
                                    <div key={group.date} className="space-y-1">
                                        <button
                                            className="w-full flex items-center gap-2 px-3 pt-1 pb-0.5 text-sm font-bold uppercase tracking-wide text-text-muted sticky top-0 bg-surface/95 backdrop-blur-sm z-10 hover:text-text-main transition-colors"
                                            onClick={() => toggleGroup(group.date, defCollapsed)}
                                        >
                                            <ChevronRight size={14} className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                                            <span>{group.label}</span>
                                            <span className="ml-auto px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] normal-case">{group.files.length}</span>
                                        </button>
                                        {!isCollapsed && group.files.map(file => (
                                            <button
                                                key={file.filename}
                                                onClick={() => { onCompareHistory(file); onClose(); }}
                                                className="w-full text-left group flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all hover:bg-slate-100"
                                            >
                                                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-slate-200 text-slate-600">
                                                    <Save size={18} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-text-main truncate">{formatTimestamp(file.timestamp)}</div>
                                                    <div className="text-xs font-medium text-text-muted truncate opacity-60 font-mono">{file.filename}</div>
                                                </div>
                                                <GitCompare size={16} className="text-text-muted group-hover:text-slate-600 transition-all shrink-0" />
                                            </button>
                                        ))}
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export const CompareModal = React.memo(CompareModalComponent);
