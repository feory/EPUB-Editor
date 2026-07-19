import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
    page: number;
    totalPages: number;
    onChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ page, totalPages, onChange }) => {
    if (totalPages <= 1) return null;

    return (
        <div className="flex items-center justify-center gap-3 px-6 py-3 border-t border-border bg-slate-50/50 shrink-0">
            <button
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                onClick={() => onChange(page - 1)}
                disabled={page <= 1}
            >
                <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-text-muted">Página {page} de {totalPages}</span>
            <button
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                onClick={() => onChange(page + 1)}
                disabled={page >= totalPages}
            >
                <ChevronRight size={16} />
            </button>
        </div>
    );
};
