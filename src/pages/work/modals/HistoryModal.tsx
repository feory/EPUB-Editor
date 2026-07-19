import React, { useState } from 'react';
import { Save, ArrowLeft, History, Download, BookOpen, ChevronRight } from 'lucide-react';
import type { HistoryFile, EpubFile } from '../../../api/ebooks-api';
import { formatFileSize } from '../../../utils/format';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';

type HistoryTab = 'history' | 'epub';

interface HistoryModalProps {
    files: HistoryFile[];
    epubFiles: EpubFile[];
    onClose: () => void;
    onLoad: (filename: string) => void;
    onDownloadEpub: (filename: string) => void;
    formatTimestamp: (ts: string) => string;
}

const HistoryModalComponent: React.FC<HistoryModalProps> = ({ files, epubFiles, onClose, onLoad, onDownloadEpub, formatTimestamp }) => {
    useBodyScrollLock();
    const [activeTab, setActiveTab] = useState<HistoryTab>('history');
    // Default: só o grupo mais recente (índice 0) aberto; restantes fechados. `overrides` guarda
    // apenas o que o utilizador alterou à mão (deriva o default do índice → sobrevive ao load async).
    const [overrides, setOverrides] = useState<Record<string, boolean>>({});
    const toggleGroup = (date: string, defCollapsed: boolean) =>
        setOverrides(prev => ({ ...prev, [date]: !(date in prev ? prev[date] : defCollapsed) }));

    const tabs: { id: HistoryTab; label: string; count: number }[] = [
        { id: 'history', label: 'Histórico', count: files.length },
        { id: 'epub', label: 'EPUBs', count: epubFiles.length },
    ];

    const currentFiles = activeTab === 'history' ? files : [];

    // Agrupa por dia (files já vêm ordenados do mais recente); chave = parte da data do timestamp.
    const groups: { date: string; label: string; files: HistoryFile[] }[] = [];
    for (const file of currentFiles) {
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

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        <History size={20} className="text-slate-500" />
                        Histórico
                    </h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                <div className="flex border-b border-border bg-slate-50/30">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`flex-1 px-4 py-3 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                activeTab === tab.id
                                    ? 'text-slate-700 border-b-2 border-slate-400 bg-white'
                                    : 'text-text-muted hover:text-text-main hover:bg-slate-100'
                            }`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                activeTab === tab.id ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-600'
                            }`}>
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="overflow-y-auto px-2 pb-2 flex-1">
                    {activeTab !== 'epub' ? (
                        currentFiles.length === 0 ? (
                            <div className="py-20 text-center text-text-muted italic flex flex-col items-center gap-3">
                                <History size={48} className="text-slate-200" />
                                Sem versões disponíveis.
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
                                            <div
                                                key={file.filename}
                                                className="group flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all hover:bg-slate-100"
                                                onClick={() => onLoad(file.filename)}
                                            >
                                                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-slate-200 text-slate-600">
                                                    <Save size={18} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-text-main truncate">{formatTimestamp(file.timestamp)}</div>
                                                    <div className="text-xs font-medium text-text-muted truncate opacity-60 font-mono">{file.filename}</div>
                                                </div>
                                                <ArrowLeft size={18} className="text-text-muted group-hover:text-slate-600 transition-all group-hover:translate-x-1" style={{ transform: 'rotate(180deg)' }} />
                                            </div>
                                        ))}
                                    </div>
                                    );
                                })}
                            </div>
                        )
                    ) : (
                        epubFiles.length === 0 ? (
                            <div className="h-full text-center text-text-muted italic flex flex-col items-center justify-center gap-3">
                                <BookOpen size={48} className="text-slate-200" />
                                Nenhum Epub gerado
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {epubFiles.map(file => (
                                    <div
                                        key={file.filename}
                                        className="group flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all hover:bg-slate-100"
                                        onClick={() => onDownloadEpub(file.filename)}
                                    >
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-slate-200 text-slate-600">
                                            <BookOpen size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-text-main truncate">{formatTimestamp(file.timestamp)}</div>
                                            <div className="text-xs font-medium text-text-muted flex items-center gap-2">
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase tracking-tighter text-[10px]">
                                                    {formatFileSize(file.size)}
                                                </span>
                                                <span className="truncate opacity-60 font-mono">{file.filename}</span>
                                            </div>
                                        </div>
                                        <Download size={18} className="text-text-muted group-hover:text-slate-600 transition-all" />
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>

            </div>
        </div>
    );
};

export const HistoryModal = React.memo(HistoryModalComponent);
