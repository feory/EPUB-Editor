import React, { useState, useCallback, useMemo } from 'react';
import { PanelLeftClose, PanelLeftOpen, Edit2, GripVertical, Trash2, Check, X } from 'lucide-react';
import { ModalCloseButton } from '../../../components/ModalCloseButton';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { subtreeRange } from '../../../utils/toc';

interface Chapter {
    title: string;
    level: 'h1' | 'h2' | 'break';
}

interface ChapterSidebarProps {
    chapters: Chapter[];
    activeChapterIndex: number;
    isFocusMode: boolean;
    isSidebarOpen: boolean;
    onToggleSidebar: () => void;
    onSelectChapter: (index: number) => void;
    onEditChapterTitle: (index: number, newTitle: string) => void;
    onReorderChapter: (from: number, to: number) => void;
    onDeleteChapter: (index: number) => void;
    readOnly?: boolean;
}

interface ChapterItemProps {
    chapter: Chapter;
    index: number;
    isActive: boolean;
    isDragging: boolean;
    dropBefore: boolean;
    confirmingDelete: boolean;
    childCount: number;
    onSelectChapter: (index: number) => void;
    onRequestEdit: (index: number, currentTitle: string) => void;
    onRequestDelete: (index: number) => void;
    onConfirmDelete: (index: number) => void;
    onCancelDelete: () => void;
    onDragStart: (index: number) => void;
    onDragOverItem: (index: number) => void;
    onDropItem: (index: number) => void;
    onDragEnd: () => void;
    readOnly?: boolean;
}

// Título a mostrar no editor de nome (breaks sem título abrem vazios).
const editValue = (c: Chapter) => (c.level === 'break' && c.title.startsWith('Quebra')) ? '' : c.title;

// Memoized so each item only re-renders when its own active state / title changes,
// not on every parent re-render (keystroke). Requires stable callback props.
const ChapterItem = React.memo<ChapterItemProps>(({
    chapter, index, isActive, isDragging, dropBefore, confirmingDelete, childCount, onSelectChapter, onRequestEdit,
    onRequestDelete, onConfirmDelete, onCancelDelete, onDragStart, onDragOverItem, onDropItem, onDragEnd, readOnly,
}) => (
    <div
        className={`relative group/item rounded-xl transition-opacity ${dropBefore ? 'border-t-2 border-slate-500' : 'border-t-2 border-transparent'} ${isDragging ? 'opacity-40' : ''}`}
        draggable={!readOnly}
        onDragStart={(e) => {
            // Fundo sólido de card no ghost de arraste (o snapshot nativo preencheria a branco).
            e.currentTarget.style.background = '#e2e8f0';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.12)';
            e.dataTransfer.effectAllowed = 'move';
            onDragStart(index);
        }}
        onDragOver={(e) => { e.preventDefault(); onDragOverItem(index); }}
        onDrop={(e) => { e.preventDefault(); onDropItem(index); }}
        onDragEnd={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.boxShadow = ''; onDragEnd(); }}
    >
        <button
            onClick={() => onSelectChapter(index)}
            className={`w-full text-left ${readOnly ? 'pl-4' : 'pl-8'} ${confirmingDelete ? 'pr-24' : 'pr-16'} py-2.5 rounded-xl text-sm font-semibold transition-all flex items-start gap-3 ${
                isActive
                    ? 'bg-slate-200 text-slate-800 border-l-4 border-transparent'
                    : 'hover:bg-slate-50 text-text-muted border-l-4 border-transparent'
            } ${chapter.level === 'h2' ? 'ml-4 scale-90' : ''}`}
        >
            <span className={`flex-1 truncate ${chapter.level === 'h1' ? 'font-bold' : 'font-medium italic'}`}>
                {chapter.title}
            </span>
        </button>
        {!readOnly && !confirmingDelete && (
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 text-slate-300 cursor-grab active:cursor-grabbing transition-all" title="Arrastar para reordenar">
                <GripVertical size={14} />
            </span>
        )}
        {!readOnly && (
            confirmingDelete ? (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 animate-in fade-in duration-150">
                    <button
                        onClick={(e) => { e.stopPropagation(); onConfirmDelete(index); }}
                        className="p-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-colors"
                        title="Confirmar eliminação"
                    >
                        <Check size={14} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}
                        className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 transition-colors"
                        title="Cancelar"
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100">
                    <button
                        onClick={(e) => { e.stopPropagation(); onRequestEdit(index, editValue(chapter)); }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all"
                        title="Editar título"
                    >
                        <Edit2 size={14} />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onRequestDelete(index); }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-rose-600 transition-all"
                        title={childCount > 0 ? `Eliminar capítulo (+${childCount} sub-capítulo${childCount > 1 ? 's' : ''})` : 'Eliminar capítulo'}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        )}
    </div>
));
ChapterItem.displayName = 'ChapterItem';

interface EditTitleModalProps {
    initialValue: string;
    onConfirm: (value: string) => void;
    onClose: () => void;
}

const EditTitleModal: React.FC<EditTitleModalProps> = ({ initialValue, onConfirm, onClose }) => {
    useBodyScrollLock();
    const [value, setValue] = useState(initialValue);
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        <Edit2 size={18} className="text-slate-500" />
                        Edição do nome do capítulo
                    </h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                <div className="p-6">
                    <input
                        autoFocus
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') onConfirm(value); if (e.key === 'Escape') onClose(); }}
                        placeholder="Nome do capítulo"
                        className="w-full text-sm text-slate-700 bg-white border border-border rounded-xl px-3 h-11 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                </div>

                <div className="p-6 border-t border-border bg-slate-50/50 flex gap-3 justify-end">
                    <button
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold transition-all shadow-sm active:scale-95"
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button
                        className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-sm active:scale-95"
                        onClick={() => onConfirm(value)}
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};

const ChapterSidebarComponent: React.FC<ChapterSidebarProps> = ({
    chapters, activeChapterIndex, isFocusMode, isSidebarOpen,
    onToggleSidebar, onSelectChapter, onEditChapterTitle, onReorderChapter, onDeleteChapter, readOnly,
}) => {
    const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);
    // Callbacks estáveis → ChapterItem memoizado não re-renderiza por keystroke
    const handleRequestEdit = useCallback((index: number, currentTitle: string) => {
        setEditing({ index, value: currentTitle });
    }, []);
    const handleRequestDelete = useCallback((index: number) => setConfirmDelete(index), []);
    const handleCancelDelete = useCallback(() => setConfirmDelete(null), []);
    const handleConfirmDelete = useCallback((index: number) => {
        onDeleteChapter(index);
        setConfirmDelete(null);
    }, [onDeleteChapter]);
    const handleDragStart = useCallback((index: number) => setDragIndex(index), []);
    const handleDragOverItem = useCallback((index: number) => setOverIndex(index), []);
    const handleDragEnd = useCallback(() => { setDragIndex(null); setOverIndex(null); }, []);
    const handleDropItem = useCallback((index: number) => {
        // Ler do closure (não dentro do updater de setState: o StrictMode corre-o 2× → toast duplo).
        if (dragIndex !== null && dragIndex !== index) onReorderChapter(dragIndex, index);
        setDragIndex(null);
        setOverIndex(null);
    }, [dragIndex, onReorderChapter]);
    // childCount só serve ao botão de eliminar (escondido em readOnly) — não vale a pena calcular lá.
    const childCounts = useMemo(() => {
        if (readOnly) return [];
        const levels = chapters.map(c => c.level);
        return chapters.map((_, index) => {
            const [s, e] = subtreeRange(levels, index);
            return e - s - 1;
        });
    }, [chapters, readOnly]);

    return (
    <>
        <aside className={`bg-surface rounded-2xl border border-border shadow-sm overflow-hidden sticky top-[89px] max-h-[calc(100vh-120px)] flex flex-col transition-all duration-300 ${
            isFocusMode ? 'w-0 opacity-0 -ml-8 pointer-events-none' : isSidebarOpen ? 'w-[330px] opacity-100' : 'w-0 opacity-0 -ml-8 pointer-events-none'
        }`}>
            <div className="px-6 py-4 min-h-[64px] border-b border-border bg-slate-50/50 flex items-center justify-between whitespace-nowrap">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">
                    Estrutura
                </h3>
                <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                    {chapters.length} Capítulos
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 text-slate-600">
                <button
                    onClick={() => onSelectChapter(-1)}
                    className={`w-full text-left px-4 min-h-[40px] rounded-xl text-sm font-bold transition-all flex items-center gap-3 ${
                        activeChapterIndex === -1
                            ? 'bg-slate-200 text-slate-800 shadow-sm'
                            : 'hover:bg-slate-100'
                    }`}
                >
                    Documento Completo
                </button>

                <div className="pt-2 pb-1 px-3">
                    <div className="h-px bg-border w-full" />
                </div>

                {chapters.map((chapter, index) => {
                    return (
                        <ChapterItem
                            key={index}
                            chapter={chapter}
                            index={index}
                            isActive={activeChapterIndex === index}
                            isDragging={dragIndex === index}
                            dropBefore={dragIndex !== null && overIndex === index && dragIndex !== index}
                            confirmingDelete={confirmDelete === index}
                            childCount={childCounts[index] ?? 0}
                            onSelectChapter={onSelectChapter}
                            onRequestEdit={handleRequestEdit}
                            onRequestDelete={handleRequestDelete}
                            onConfirmDelete={handleConfirmDelete}
                            onCancelDelete={handleCancelDelete}
                            onDragStart={handleDragStart}
                            onDragOverItem={handleDragOverItem}
                            onDropItem={handleDropItem}
                            onDragEnd={handleDragEnd}
                            readOnly={readOnly}
                        />
                    );
                })}
                {!readOnly && chapters.length > 0 && (
                    <div
                        onDragOver={(e) => { e.preventDefault(); setOverIndex(chapters.length); }}
                        onDrop={(e) => { e.preventDefault(); handleDropItem(chapters.length); }}
                        className={`h-6 rounded-xl ${dragIndex !== null && overIndex === chapters.length ? 'border-t-2 border-slate-500' : ''}`}
                    />
                )}
            </div>
        </aside>

        <div className={`sticky top-1/2 -translate-y-1/2 z-10 transition-all duration-300 ${isFocusMode ? 'hidden' : 'ml-0'}`}>
            <button
                onClick={onToggleSidebar}
                className="w-8 h-12 rounded-full flex items-center justify-center text-text-muted hover:text-slate-700 transition-all"
                title={isSidebarOpen ? 'Ocultar Estrutura' : 'Mostrar Estrutura'}
            >
                {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>
        </div>

        {editing && (
            <EditTitleModal
                initialValue={editing.value}
                onConfirm={(value) => { onEditChapterTitle(editing.index, value); setEditing(null); }}
                onClose={() => setEditing(null)}
            />
        )}
    </>
    );
};

export const ChapterSidebar = React.memo(ChapterSidebarComponent);
