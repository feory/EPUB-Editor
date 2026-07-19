import React from 'react';
import { Trash2, Download, Loader2, CheckSquare, X } from 'lucide-react';

interface BatchActionsBarProps {
    selectedCount: number;
    totalCount: number;
    isExporting: boolean;
    onSelectAll: () => void;
    onExportSelected: () => void;
    onDeleteSelected: () => void;
    onClearSelection: () => void;
}

export const BatchActionsBar: React.FC<BatchActionsBarProps> = ({
    selectedCount,
    totalCount,
    isExporting,
    onSelectAll,
    onExportSelected,
    onDeleteSelected,
    onClearSelection,
}) => (
    <div className="p-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700">
            {selectedCount}/{totalCount}
        </span>
        <div className="flex gap-2">
            <button
                onClick={onSelectAll}
                className="flex items-center justify-center w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                title="Selecionar todas"
            >
                <CheckSquare size={16} />
            </button>
            <button
                onClick={onExportSelected}
                disabled={isExporting}
                className="flex items-center justify-center w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors disabled:opacity-50"
                title="Descarregar selecionadas"
            >
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            </button>
            <button
                onClick={onDeleteSelected}
                className="flex items-center justify-center w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                title="Apagar selecionadas"
            >
                <Trash2 size={16} />
            </button>
            <button
                onClick={onClearSelection}
                className="flex items-center justify-center w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                title="Cancelar seleção"
            >
                <X size={16} />
            </button>
        </div>
    </div>
);
