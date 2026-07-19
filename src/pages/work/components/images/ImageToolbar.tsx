import React, { useEffect, useRef } from 'react';
import { Search, Upload, Filter, Download, ChevronDown, Loader2, X } from 'lucide-react';

interface ImageToolbarProps {
    imagesCount: number;
    usedCount: number;
    unusedCount: number;
    filter: 'all' | 'used' | 'unused';
    onFilterChange: (f: 'all' | 'used' | 'unused') => void;
    activeDropdown: 'filter' | 'export' | null;
    onToggleDropdown: (d: 'filter' | 'export') => void;
    filterMenuRef: React.RefObject<HTMLDivElement>;
    exportMenuRef: React.RefObject<HTMLDivElement>;
    searchExpanded: boolean;
    onSearchExpand: () => void;
    searchQuery: string;
    onSearchChange: (v: string) => void;
    onSearchClose: () => void;
    searchInputRef: React.RefObject<HTMLInputElement>;
    isUploading: boolean;
    isExporting: boolean;
    onFileUpload: (files: FileList | null) => void;
    onExportZip: (type: 'all' | 'used' | 'unused') => void;
}

export const ImageToolbar: React.FC<ImageToolbarProps> = ({
    imagesCount, usedCount, unusedCount,
    filter, onFilterChange,
    activeDropdown, onToggleDropdown,
    filterMenuRef, exportMenuRef,
    searchExpanded, onSearchExpand,
    searchQuery, onSearchChange, onSearchClose,
    searchInputRef,
    isUploading, isExporting,
    onFileUpload, onExportZip,
}) => {
    // Clicar fora colapsa a pesquisa (só quando vazia — não destrói um filtro ativo)
    const searchBoxRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!searchExpanded) return;
        const onDown = (e: MouseEvent) => {
            if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node) && !searchQuery) {
                onSearchClose();
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [searchExpanded, searchQuery, onSearchClose]);

    return (
    <div className="px-6 min-h-[48px] flex items-center border-b border-border bg-white">
        <div className="flex items-center justify-end gap-2 w-full">
            {!searchExpanded && (
                <span className="mr-auto text-xs font-bold uppercase text-slate-600">
                    {imagesCount} {imagesCount === 1 ? 'imagem' : 'imagens'}
                </span>
            )}
            {searchExpanded ? (
                <div ref={searchBoxRef} className="relative flex-1 animate-in fade-in slide-in-from-right-2 duration-200">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Procurar por nome..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="w-full pl-10 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                    <button
                        onClick={onSearchClose}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        title="Fechar pesquisa"
                    >
                        <X size={16} />
                    </button>
                </div>
            ) : (
                <button
                    onClick={onSearchExpand}
                    className="flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all"
                    title="Procurar imagens"
                >
                    <Search size={16} />
                </button>
            )}

            <label
                className="flex items-center justify-center w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all cursor-pointer"
                title="Carregar imagens"
            >
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => onFileUpload(e.target.files)}
                    disabled={isUploading}
                    className="hidden"
                />
                {isUploading
                    ? <Loader2 size={16} className="animate-spin text-primary" />
                    : <Upload size={16} />
                }
            </label>

            <div className="relative" ref={filterMenuRef}>
                <button
                    onClick={() => onToggleDropdown('filter')}
                    className={`w-full flex items-center justify-between gap-2 min-w-[110px] h-8 px-2.5 rounded-lg text-xs font-mono uppercase font-bold transition-all ${
                        activeDropdown === 'filter'
                            ? 'bg-slate-200 text-slate-700 shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <Filter size={14} />
                        <span>Filtros</span>
                    </div>
                    <ChevronDown size={14} className={`transition-transform ${activeDropdown === 'filter' ? 'rotate-180' : ''}`} />
                </button>

                {activeDropdown === 'filter' && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10 animate-in fade-in slide-in-from-top-1 duration-150">
                        <button
                            onClick={() => { onFilterChange('all'); onToggleDropdown('filter'); }}
                            className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${filter === 'all' ? 'font-bold text-slate-700 bg-slate-100' : 'text-slate-700'}`}
                        >
                            <span>Todas</span>
                            <span className="text-xs text-slate-400">({imagesCount})</span>
                        </button>
                        <button
                            onClick={() => { onFilterChange('used'); onToggleDropdown('filter'); }}
                            className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${filter === 'used' ? 'font-bold text-slate-700 bg-slate-100' : 'text-slate-700'}`}
                        >
                            <span>Usadas</span>
                            <span className="text-xs text-slate-400">({usedCount})</span>
                        </button>
                        <button
                            onClick={() => { onFilterChange('unused'); onToggleDropdown('filter'); }}
                            className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${filter === 'unused' ? 'font-bold text-slate-700 bg-slate-100' : 'text-slate-700'}`}
                        >
                            <span>Não usadas</span>
                            <span className="text-xs text-slate-400">({unusedCount})</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="relative flex-1 hidden" ref={exportMenuRef}>
                <button
                    onClick={() => onToggleDropdown('export')}
                    disabled={isExporting || imagesCount === 0}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50 ${
                        activeDropdown === 'export'
                            ? 'bg-slate-200 text-slate-700 shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <Download size={14} />
                        <span>Exportar</span>
                    </div>
                    <ChevronDown size={14} className={`transition-transform ${activeDropdown === 'export' ? 'rotate-180' : ''}`} />
                </button>

                {activeDropdown === 'export' && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10 animate-in fade-in slide-in-from-top-1 duration-150">
                        <button
                            onClick={() => { onExportZip('all'); onToggleDropdown('export'); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <span>Todas as imagens</span>
                            <span className="text-xs text-slate-400">({imagesCount})</span>
                        </button>
                        <button
                            onClick={() => { onExportZip('used'); onToggleDropdown('export'); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <span>Apenas usadas</span>
                            <span className="text-xs text-slate-400">({usedCount})</span>
                        </button>
                        <button
                            onClick={() => { onExportZip('unused'); onToggleDropdown('export'); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <span>Apenas não usadas</span>
                            <span className="text-xs text-slate-400">({unusedCount})</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    </div>
    );
};
