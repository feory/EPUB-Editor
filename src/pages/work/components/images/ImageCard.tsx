import React from 'react';
import { Plus, Maximize2, Trash2, Edit2, Check, X, Loader2, AlertCircle, Square, RefreshCw, Crosshair } from 'lucide-react';
import { formatFileSize } from '../../../../utils/format';
import type { ImageData } from './useImageGallery';

interface ImageCardProps {
    image: ImageData;
    isbn: string;
    isSelected: boolean;
    isRenaming: boolean;
    newName: string;
    onNewNameChange: (v: string) => void;
    onToggleSelect: (id: string) => void;
    onInsert: (img: ImageData) => void;
    onLocate: (img: ImageData) => void;
    onView: (img: ImageData) => void;
    onDelete: (img: ImageData) => void;
    onReplaceImage: (id: string, file: File) => void;
    onStartRename: (id: string) => void;
    onConfirmRename: (id: string, name: string) => void;
    onCancelRename: () => void;
    onVisible: (id: string) => void;
}

const ImageCardComponent: React.FC<ImageCardProps> = ({
    image, isbn,
    isSelected, isRenaming, newName,
    onNewNameChange, onToggleSelect,
    onInsert, onLocate, onView, onDelete, onReplaceImage,
    onStartRename, onConfirmRename, onCancelRename,
    onVisible,
}) => {
    // VirtuosoGrid only mounts near-visible cards → request the thumbnail on mount.
    React.useEffect(() => { onVisible(image.id); }, [onVisible, image.id]);
    return (
    <div
        data-image-id={image.id}
        className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group"
    >
        <div className="aspect-square bg-slate-100 relative overflow-hidden group/thumb">
            {image.loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={24} className="animate-spin text-primary" />
                </div>
            )}
            {image.error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-rose-500">
                    <AlertCircle size={24} />
                    <span className="text-xs font-semibold">Erro</span>
                </div>
            )}
            {image.url && (
                <img
                    src={image.url}
                    alt={image.id}
                    className="w-full h-full object-contain cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => onView(image)}
                />
            )}

            <div className="absolute top-2 left-2">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(image.id); }}
                    className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all shadow-sm ${
                        isSelected
                            ? 'bg-slate-200 border-slate-400'
                            : 'bg-white/90 hover:bg-white border-slate-300'
                    }`}
                >
                    {isSelected
                        ? <Check size={16} className="text-slate-600" />
                        : <Square size={16} className="text-slate-400" />
                    }
                </button>
            </div>

            {image.usageCount > 0 && (
                <div className="absolute top-2 right-2 bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-full shadow-md">
                    {image.usageCount}×
                </div>
            )}
        </div>

        <div className="p-3 space-y-2">
            {isRenaming ? (
                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => onNewNameChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onConfirmRename(image.id, newName);
                            else if (e.key === 'Escape') onCancelRename();
                        }}
                        className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-white border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/20"
                        autoFocus
                        placeholder="Novo nome..."
                    />
                    <button
                        onClick={() => onConfirmRename(image.id, newName)}
                        className="shrink-0 p-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded transition-colors"
                        title="Confirmar"
                    >
                        <Check size={14} />
                    </button>
                    <button
                        onClick={onCancelRename}
                        className="shrink-0 p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                        title="Cancelar"
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-1 group/name">
                    <div className="flex-1 text-xs font-mono text-slate-500 truncate" title={image.id}>
                        {image.id}
                    </div>
                    <button
                        onClick={() => onStartRename(image.id)}
                        className="opacity-0 group-hover/name:opacity-100 p-1 hover:bg-slate-100 text-slate-400 hover:text-primary rounded transition-all"
                        title="Renomear"
                    >
                        <Edit2 size={12} />
                    </button>
                </div>
            )}

            {image.dimensions && (
                <div className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>{image.dimensions.width} × {image.dimensions.height}</span>
                    <span>{formatFileSize(image.size)}</span>
                </div>
            )}

            <div className="flex gap-1 pt-1">
                <button
                    onClick={() => onInsert(image)}
                    className="flex-1 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-colors"
                    title="Inserir no cursor"
                >
                    <Plus size={14} />
                </button>
                <label
                    className="flex-1 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-colors cursor-pointer"
                    title="Substituir imagem"
                >
                    <RefreshCw size={14} />
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplaceImage(image.id, f); }}
                        className="hidden"
                    />
                </label>
                <button
                    onClick={() => onLocate(image)}
                    className="flex-1 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-colors"
                    title="Localizar no editor"
                >
                    <Crosshair size={14} />
                </button>
                <button
                    onClick={() => onView(image)}
                    className="flex-1 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-colors"
                    title="Ver imagem completa"
                >
                    <Maximize2 size={14} />
                </button>
                <button
                    onClick={() => onDelete(image)}
                    className="flex-1 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 p-1.5 rounded-lg transition-colors"
                    title="Apagar imagem"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    </div>
    );
};

export const ImageCard = React.memo(ImageCardComponent);
