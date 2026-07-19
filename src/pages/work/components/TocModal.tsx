import React, { useState, useCallback } from 'react';
import { ListTree, GripVertical, Check, Info } from 'lucide-react';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';

interface Chapter {
    title: string;
    level: 'h1' | 'h2' | 'break';
}

interface TocModalProps {
    chapters: Chapter[];
    onReorderChapter: (from: number, to: number) => void;
    onEditChapterTitle: (index: number, newTitle: string) => void;
    onClose: () => void;
}

const LEVEL_LABEL: Record<Chapter['level'], string> = { h1: 'Título 1', h2: 'Título 2', break: 'Quebra' };

const TocModalComponent: React.FC<TocModalProps> = ({ chapters, onReorderChapter, onEditChapterTitle, onClose }) => {
    useBodyScrollLock();
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);
    const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);

    // Ler do closure (não dentro do updater de setState: o StrictMode corre-o 2× → toast duplo).
    const drop = useCallback((index: number) => {
        if (dragIndex !== null && dragIndex !== index) onReorderChapter(dragIndex, index);
        setDragIndex(null);
        setOverIndex(null);
    }, [dragIndex, onReorderChapter]);

    const commitEdit = useCallback(() => {
        if (editing) onEditChapterTitle(editing.index, editing.value);
        setEditing(null);
    }, [editing, onEditChapterTitle]);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        <ListTree size={18} className="text-slate-500" />
                        Editor de TOC
                        <span className="group relative inline-flex cursor-help">
                            <Info size={15} className="text-slate-400" />
                            <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 w-64 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-normal normal-case tracking-normal text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
                                Arraste para reodernação.
                            </span>
                        </span>
                    </h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                    {chapters.map((chapter, index) => (
                        <div
                            key={index}
                            draggable={editing?.index !== index}
                            onDragStart={(e) => {
                                // Fundo sólido de card no ghost de arraste (o snapshot nativo preencheria a branco).
                                e.currentTarget.style.background = '#e2e8f0';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.12)';
                                e.dataTransfer.effectAllowed = 'move';
                                setDragIndex(index);
                            }}
                            onDragOver={(e) => { e.preventDefault(); setOverIndex(index); }}
                            onDrop={(e) => { e.preventDefault(); drop(index); }}
                            onDragEnd={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.boxShadow = ''; setDragIndex(null); setOverIndex(null); }}
                            className={`flex items-center gap-2 rounded-xl px-2 py-2 transition-opacity ${
                                dragIndex !== null && overIndex === index && dragIndex !== index ? 'border-t-2 border-slate-500' : 'border-t-2 border-transparent'
                            } ${chapter.level === 'h2' ? 'ml-6' : ''} ${dragIndex === index ? 'opacity-40' : 'hover:bg-slate-50'}`}
                        >
                            <GripVertical size={15} className="shrink-0 text-slate-300 cursor-grab active:cursor-grabbing" />
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400 w-16">{LEVEL_LABEL[chapter.level]}</span>
                            {editing?.index === index ? (
                                <input
                                    autoFocus
                                    value={editing.value}
                                    onChange={e => setEditing({ index, value: e.target.value })}
                                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null); }}
                                    onBlur={commitEdit}
                                    className="flex-1 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg px-2 h-8 focus:outline-none focus:ring-2 focus:ring-slate-300"
                                />
                            ) : (
                                <button
                                    onClick={() => setEditing({ index, value: chapter.title.startsWith('Quebra') ? '' : chapter.title })}
                                    className={`flex-1 text-left truncate text-sm ${chapter.level === 'h1' ? 'font-bold text-slate-700' : 'font-medium italic text-slate-600'}`}
                                    title="Renomear"
                                >
                                    {chapter.title}
                                </button>
                            )}
                            {editing?.index === index && (
                                <button onMouseDown={(e) => e.preventDefault()} onClick={commitEdit} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-800 text-white">
                                    <Check size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                    {chapters.length > 0 && (
                        <div
                            onDragOver={(e) => { e.preventDefault(); setOverIndex(chapters.length); }}
                            onDrop={(e) => { e.preventDefault(); drop(chapters.length); }}
                            className={`h-8 rounded-xl ${dragIndex !== null && overIndex === chapters.length ? 'border-t-2 border-slate-500' : ''}`}
                        />
                    )}
                    {chapters.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Sem capítulos.</p>}
                </div>
            </div>
        </div>
    );
};

export const TocModal = React.memo(TocModalComponent);
