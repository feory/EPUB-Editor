import React, { useState, useRef } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { X, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import type { WorkEditorRef } from './WorkEditor';
import { useImageGallery } from './images/useImageGallery';
import { BatchActionsBar } from './images/BatchActionsBar';
import { ImageToolbar } from './images/ImageToolbar';
import { ImageCard } from './images/ImageCard';
import { ImageLightbox } from './images/ImageLightbox';

interface ImageGallerySidebarProps {
    isbn: string;
    htmlContent: string;
    onClose: () => void;
    editorRef: React.RefObject<WorkEditorRef | null>;
    onContentUpdate: (newHtml: string) => void;
    refreshKey?: number;
}

const ImageGallerySidebarComponent: React.FC<ImageGallerySidebarProps> = ({
    isbn, htmlContent, onClose, editorRef, onContentUpdate, refreshKey,
}) => {
    const gallery = useImageGallery({ isbn, htmlContent, editorRef, onContentUpdate, refreshKey });

    const [isDragging, setIsDragging] = useState(false);
    const dragDepth = useRef(0);

    const handleDragEnter = (e: React.DragEvent) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return;
        dragDepth.current += 1;
        setIsDragging(true);
    };
    const handleDragLeave = () => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
    };
    const handleDrop = (e: React.DragEvent) => {
        dragDepth.current = 0;
        setIsDragging(false);
        gallery.handleDrop(e);
    };

    return (
        <>
            <aside
                className="fixed right-4 top-[89px] h-[765px] max-h-[calc(100vh-105px)] w-[500px] bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border border-border rounded-2xl overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300"
                onDragEnter={handleDragEnter}
                onDragOver={gallery.handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className="px-6 py-4 min-h-[64px] border-b border-border flex items-center justify-between bg-slate-50/50">
                    <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Galeria</h3>                    <button
                        onClick={onClose}
                        className="flex items-center justify-center w-8 h-8 shrink-0 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                <ImageToolbar
                    imagesCount={gallery.images.size}
                    usedCount={gallery.usedImageCount}
                    unusedCount={gallery.unusedImageCount}
                    filter={gallery.filter}
                    onFilterChange={gallery.setFilter}
                    activeDropdown={gallery.activeDropdown}
                    onToggleDropdown={(d) => gallery.setActiveDropdown(gallery.activeDropdown === d ? null : d)}
                    filterMenuRef={gallery.filterMenuRef}
                    exportMenuRef={gallery.exportMenuRef}
                    searchExpanded={gallery.searchExpanded}
                    onSearchExpand={() => gallery.setSearchExpanded(true)}
                    searchQuery={gallery.searchQuery}
                    onSearchChange={gallery.setSearchQuery}
                    onSearchClose={() => { gallery.setSearchQuery(''); gallery.setSearchExpanded(false); }}
                    searchInputRef={gallery.searchInputRef}
                    isUploading={gallery.isUploading}
                    isExporting={gallery.isExporting}
                    onFileUpload={gallery.handleFileUpload}
                    onExportZip={gallery.handleExportZip}
                />

                {gallery.selectedIds.size > 0 && (
                    <BatchActionsBar
                        selectedCount={gallery.selectedIds.size}
                        totalCount={gallery.filteredImages.length}
                        isExporting={gallery.isExporting}
                        onSelectAll={gallery.selectAll}
                        onExportSelected={gallery.handleExportSelected}
                        onDeleteSelected={gallery.handleDeleteSelected}
                        onClearSelection={gallery.clearSelection}
                    />
                )}

                <div className="flex-1 overflow-hidden bg-slate-50/50">
                    {gallery.filteredImages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-text-muted gap-3 px-10 text-center">
                            <ImageIcon size={48} className="text-slate-300" />
                            <h4 className="font-bold text-slate-900">Nenhuma imagem</h4>
                            <p className="text-sm leading-relaxed">
                                {gallery.images.size === 0
                                    ? 'Carregue imagens ou importe um documento com imagens.'
                                    : 'Nenhuma imagem corresponde à sua pesquisa.'}
                            </p>
                        </div>
                    ) : (
                        <VirtuosoGrid
                            style={{ height: '100%' }}
                            data={gallery.filteredImages}
                            listClassName="grid grid-cols-2 gap-3 p-4"
                            itemContent={(_i, image) => (
                                <ImageCard
                                    image={image}
                                    isbn={isbn}
                                    isSelected={gallery.selectedIds.has(image.id)}
                                    isRenaming={gallery.renamingId === image.id}
                                    newName={gallery.newName}
                                    onNewNameChange={gallery.setNewName}
                                    onToggleSelect={gallery.toggleSelection}
                                    onInsert={gallery.handleInsertAtCursor}
                                    onLocate={gallery.handleLocateImage}
                                    onView={gallery.setLightboxImage}
                                    onDelete={gallery.handleDeleteImage}
                                    onReplaceImage={gallery.handleReplaceImage}
                                    onStartRename={gallery.startRename}
                                    onConfirmRename={gallery.handleRenameImage}
                                    onCancelRename={gallery.cancelRename}
                                    onVisible={gallery.loadImage}
                                />
                            )}
                        />
                    )}
                </div>

                {(isDragging || gallery.isUploading) && (
                    <div className="absolute inset-0 z-50 p-4 bg-white/90 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                        <div className="w-full h-full border-2 border-dashed border-slate-400 rounded-2xl bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-600">
                            {gallery.isUploading ? (
                                <>
                                    <Loader2 size={48} className="animate-spin text-slate-400" />
                                    <p className="font-bold">A carregar imagens…</p>
                                </>
                            ) : (
                                <>
                                    <Upload size={48} className="text-slate-400" />
                                    <p className="font-bold">Solte as imagens para carregar</p>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </aside>

            {gallery.lightboxImage && (
                <ImageLightbox
                    image={gallery.lightboxImage}
                    isbn={isbn}
                    onClose={() => gallery.setLightboxImage(null)}
                />
            )}
        </>
    );
};

export const ImageGallerySidebar = React.memo(ImageGallerySidebarComponent);
