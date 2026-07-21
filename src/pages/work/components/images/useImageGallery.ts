import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ebooksApi } from '../../../../api/ebooks-api';
import { useNotification } from '../../../../context/NotificationContext';
import { sanitizeImageFilename } from '../../../../utils/format';
import { useImageCrop } from './useImageCrop';
import type { WorkEditorRef } from '../WorkEditor';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface ImageData {
    id: string;
    url: string;
    blob: Blob | null;
    loading: boolean;
    error: boolean;
    dimensions?: { width: number; height: number };
    size?: number;
    usageCount: number;
}

interface UseImageGalleryOptions {
    isbn: string;
    htmlContent: string;
    editorRef: React.RefObject<WorkEditorRef | null>;
    onContentUpdate: (newHtml: string) => void;
    refreshKey?: number;
}

// One pass over the HTML → count per image id (vs O(images × |html|) when done per image)
function countAllImageUsage(html: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const m of html.matchAll(/data-image-id="([^"]+)"/g)) {
        counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
    return counts;
}

export function useImageGallery({ isbn, htmlContent, editorRef, onContentUpdate, refreshKey }: UseImageGalleryOptions) {
    const { showNotification } = useNotification();
    const [images, setImages] = useState<Map<string, ImageData>>(new Map());
    const [searchQuery, setSearchQuery] = useState('');
    const [lightboxImage, setLightboxImage] = useState<ImageData | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [filter, setFilter] = useState<'all' | 'used' | 'unused'>('all');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isExporting, setIsExporting] = useState(false);
    const [activeDropdown, setActiveDropdown] = useState<'filter' | 'export' | null>(null);
    const [searchExpanded, setSearchExpanded] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const filterMenuRef = useRef<HTMLDivElement>(null);
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const imagesRef = useRef(images);
    useEffect(() => { imagesRef.current = images; }, [images]);
    // Fresh htmlContent via ref → callbacks below stay stable (don't depend on htmlContent)
    const htmlContentRef = useRef(htmlContent);
    htmlContentRef.current = htmlContent;

    const countImageUsage = useCallback((html: string, imageId: string): number => {
        const matches = html.match(new RegExp(`data-image-id="${imageId}"`, 'g'));
        return matches ? matches.length : 0;
    }, []);

    // Load image list from server — only on isbn change
    useEffect(() => {
        const load = async () => {
            try {
                const response = await ebooksApi.listImages(isbn);
                const newImages = new Map<string, ImageData>();
                response.data.images.forEach(img => {
                    newImages.set(img.id, {
                        id: img.id, url: '', blob: null, loading: false, error: false,
                        size: img.size, dimensions: img.dimensions || undefined,
                        usageCount: countImageUsage(htmlContent, img.id),
                    });
                });
                setImages(newImages);
            } catch (error) {
                console.error('Erro ao carregar lista de imagens:', error);
                showNotification('error', 'Erro ao carregar lista de imagens');
            }
        };
        load();
    }, [isbn, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Update usage counts when content changes (debounced; single scan for all images)
    useEffect(() => {
        const t = setTimeout(() => {
            const counts = countAllImageUsage(htmlContent);
            setImages(prev => {
                if (prev.size === 0) return prev;
                // Preserve object identity for unchanged images → React.memo on ImageCard skips them
                let changed = false;
                const updated = new Map(prev);
                prev.forEach((img, id) => {
                    const c = counts.get(id) ?? 0;
                    if (img.usageCount !== c) { updated.set(id, { ...img, usageCount: c }); changed = true; }
                });
                return changed ? updated : prev;
            });
        }, 400);
        return () => clearTimeout(t);
    }, [htmlContent]);

    const loadImage = useCallback(async (imageId: string, force = false) => {
        // Skip if already loaded/loading (cards re-mount on virtual-scroll → avoid re-fetch).
        // force=true ignora este atalho — usado logo a seguir a um upload/substituição/corte,
        // onde o setImages(...) que limpou o blob antigo ainda não comitou quando este corre
        // (imagesRef.current só atualiza no próximo render), senão o fetch nunca dispara.
        const existing = imagesRef.current.get(imageId);
        if (!force && existing && (existing.blob || existing.loading)) return;
        setImages(prev => {
            const newMap = new Map(prev);
            const img = newMap.get(imageId);
            if (img && !img.loading) newMap.set(imageId, { ...img, loading: true });
            return newMap;
        });
        try {
            // cache-bust: mesma URL de antes, bytes novos no servidor — sem isto o browser
            // podia servir a resposta em cache da 1ª vez que esta imagem foi pedida.
            const response = await fetch(`/api/ebooks/${isbn}/images/${imageId}?thumbnail=true&v=${Date.now()}`);
            if (!response.ok) throw new Error('Failed to load thumbnail');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setImages(prev => {
                const newMap = new Map(prev);
                const imageData = newMap.get(imageId);
                if (imageData) newMap.set(imageId, { ...imageData, url, blob, loading: false });
                return newMap;
            });
        } catch (error) {
            console.error(`Failed to load image ${imageId}:`, error);
            setImages(prev => {
                const newMap = new Map(prev);
                const imageData = newMap.get(imageId);
                if (imageData) newMap.set(imageId, { ...imageData, loading: false, error: true });
                return newMap;
            });
        }
    }, [isbn]);

    // Lazy-load is handled by VirtuosoGrid: only near-visible cards mount and call loadImage
    // on mount (see ImageCard). No IntersectionObserver needed.

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (activeDropdown === 'filter' && filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setActiveDropdown(null);
            } else if (activeDropdown === 'export' && exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeDropdown]);

    useEffect(() => {
        if (searchExpanded && searchInputRef.current) searchInputRef.current.focus();
    }, [searchExpanded]);

    useEffect(() => {
        return () => { imagesRef.current.forEach(img => { if (img.url) URL.revokeObjectURL(img.url); }); };
    }, []);

    const filteredImages = useMemo(() => {
        let arr = Array.from(images.values());
        if (filter === 'used') arr = arr.filter(img => img.usageCount > 0);
        else if (filter === 'unused') arr = arr.filter(img => img.usageCount === 0);
        if (searchQuery.trim()) arr = arr.filter(img => img.id.toLowerCase().includes(searchQuery.toLowerCase()));
        return arr;
    }, [images, searchQuery, filter]);

    const usedImageCount = useMemo(() => Array.from(images.values()).filter(img => img.usageCount > 0).length, [images]);
    const unusedImageCount = useMemo(() => Array.from(images.values()).filter(img => img.usageCount === 0).length, [images]);

    const handleInsertAtCursor = useCallback((imageData: ImageData) => {
        if (editorRef.current) {
            editorRef.current.insertContent(
                `<img data-image-id="${imageData.id}" src="/api/ebooks/${isbn}/images/${imageData.id}" alt="Imagem" style="max-width: 100%; height: auto;" loading="lazy" />`
            );
            showNotification('success', 'Imagem inserida no cursor', 2000);
        }
    }, [isbn, editorRef, showNotification]);

    const handleLocateImage = useCallback((imageData: ImageData) => {
        const found = editorRef.current?.scrollToImage(imageData.id);
        if (!found) showNotification('info', 'Imagem não usada neste capítulo', 2000);
    }, [editorRef, showNotification]);

    const handleRenameImage = useCallback(async (imageId: string, newImageName: string) => {
        if (!newImageName.trim()) { showNotification('error', 'Nome não pode estar vazio'); return; }
        try {
            const response = await ebooksApi.renameImage(isbn, imageId, newImageName);
            const { newId, oldId } = response.data;
            const updatedHtml = htmlContentRef.current
                .replace(new RegExp(`data-image-id="${oldId}"`, 'g'), `data-image-id="${newId}"`)
                .replace(new RegExp(`/images/${oldId}`, 'g'), `/images/${newId}`);
            onContentUpdate(updatedHtml);

            const imagesResponse = await ebooksApi.listImages(isbn);
            setImages(prev => {
                const newImages = new Map<string, ImageData>();
                if (oldId !== newId) { const old = prev.get(oldId); if (old?.url) URL.revokeObjectURL(old.url); }
                imagesResponse.data.images.forEach(img => {
                    const existing = prev.get(img.id);
                    newImages.set(img.id, {
                        id: img.id,
                        url: img.id === newId ? '' : (existing?.url || ''),
                        blob: img.id === newId ? null : (existing?.blob || null),
                        loading: false, error: false,
                        size: img.size, dimensions: img.dimensions || undefined,
                        usageCount: countImageUsage(updatedHtml, img.id),
                    });
                });
                return newImages;
            });
            loadImage(newId);
            setRenamingId(null);
            setNewName('');
            showNotification('success', 'Imagem renomeada com sucesso', 2000);
        } catch (error: any) {
            console.error('Failed to rename image:', error);
            showNotification('error', error.response?.data?.error || 'Erro ao renomear imagem');
        }
    }, [isbn, countImageUsage, onContentUpdate, loadImage, showNotification]);

    const toggleSelection = useCallback((imageId: string) => {
        setSelectedIds(prev => { const s = new Set(prev); s.has(imageId) ? s.delete(imageId) : s.add(imageId); return s; });
    }, []);

    const clearSelection = useCallback(() => { setSelectedIds(new Set()); }, []);

    // Stable callbacks for ImageCard (so React.memo holds — no new closures per render)
    const startRename = useCallback((id: string) => { setRenamingId(id); setNewName(id); }, []);
    const cancelRename = useCallback(() => { setRenamingId(null); setNewName(''); }, []);

    const selectAll = useCallback(() => {
        // Toggle: se já estão todas selecionadas, desmarca todas.
        setSelectedIds(prev =>
            filteredImages.length > 0 && filteredImages.every(img => prev.has(img.id))
                ? new Set()
                : new Set(filteredImages.map(img => img.id))
        );
    }, [filteredImages]);

    const requestDeleteSelected = useCallback(() => {
        if (selectedIds.size === 0) return;
        setConfirmDeleteSelected(true);
    }, [selectedIds]);
    const cancelDeleteSelected = useCallback(() => setConfirmDeleteSelected(false), []);

    const handleDeleteSelected = useCallback(async () => {
        if (selectedIds.size === 0) return;
        setConfirmDeleteSelected(false);
        try {
            const idsToRemove = Array.from(selectedIds);
            if (editorRef.current) {
                const newHtml = editorRef.current.removeImagesById(idsToRemove);
                if (newHtml !== undefined) onContentUpdate(newHtml);
            } else {
                const baseHtml = htmlContentRef.current;
                let newHtml = baseHtml;
                for (const id of idsToRemove) newHtml = newHtml.replace(new RegExp(`<img[^>]*data-image-id="${id}"[^>]*>`, 'g'), '');
                if (newHtml !== baseHtml) onContentUpdate(newHtml);
            }
            for (const id of idsToRemove) {
                const img = images.get(id);
                try { await ebooksApi.deleteImage(isbn, id); } catch (e) { console.error(`Failed to delete ${id}:`, e); }
                if (img?.url) URL.revokeObjectURL(img.url);
            }
            setImages(prev => { const m = new Map(prev); selectedIds.forEach(id => m.delete(id)); return m; });
            clearSelection();
            showNotification('success', `${selectedIds.size} imagens apagadas`, 2000);
        } catch (error) {
            console.error('Failed to delete images:', error);
            showNotification('error', 'Erro ao apagar imagens');
        }
    }, [selectedIds, images, isbn, editorRef, onContentUpdate, clearSelection, showNotification]);

    const handleReplaceImage = useCallback(async (imageId: string, file: File) => {
        try {
            const formData = new FormData();
            formData.append('image', file, file.name);
            // Overwrite o ficheiro do MESMO imageId (mantém referências no HTML);
            // uploadImages (batch) gravaria sob um id novo (= nome do ficheiro).
            await ebooksApi.uploadImage(isbn, imageId, formData);
            setImages(prev => {
                const m = new Map(prev);
                const img = m.get(imageId);
                if (img) { if (img.url) URL.revokeObjectURL(img.url); m.set(imageId, { ...img, url: '', blob: null }); }
                return m;
            });
            loadImage(imageId, true);
            showNotification('success', 'Imagem substituída com sucesso', 2000);
        } catch (error) {
            console.error('Failed to replace image:', error);
            showNotification('error', 'Erro ao substituir imagem');
        }
    }, [isbn, loadImage, showNotification]);

    // Corte de imagem: ver useImageCrop — atualiza o cache local (url/blob) para forçar reload
    // da thumbnail depois de gravar (mesmo pós-processamento de handleReplaceImage).
    const { cropImage, handleOpenCrop, handleCropSave, handleCropCancel } = useImageCrop(isbn, useCallback((imageId: string) => {
        setImages(prev => {
            const m = new Map(prev);
            const img = m.get(imageId);
            if (img) { if (img.url) URL.revokeObjectURL(img.url); m.set(imageId, { ...img, url: '', blob: null }); }
            return m;
        });
        loadImage(imageId, true);
    }, [loadImage]));

    const exportImagesToZip = useCallback(async (imagesToExport: ImageData[], zipName: string) => {
        if (imagesToExport.length === 0) { showNotification('error', 'Nenhuma imagem para exportar'); return; }
        setIsExporting(true);
        try {
            const imageList = await ebooksApi.listImages(isbn);
            const filenameMap = new Map(imageList.data.images.map(i => [i.id, i.filename]));

            // Uma só imagem → descarregar o ficheiro direto, sem zip.
            if (imagesToExport.length === 1) {
                const img = imagesToExport[0];
                const blob = await (await fetch(`/api/ebooks/${isbn}/images/${img.id}`)).blob();
                saveAs(blob, filenameMap.get(img.id) || `${img.id}.png`);
                showNotification('success', '1 imagem exportada', 2000);
                return;
            }

            const zip = new JSZip();
            for (const img of imagesToExport) {
                try {
                    const blob = await (await fetch(`/api/ebooks/${isbn}/images/${img.id}`)).blob();
                    zip.file(filenameMap.get(img.id) || `${img.id}.png`, blob);
                } catch (e) { console.error(`Failed to add ${img.id} to ZIP:`, e); }
            }
            saveAs(await zip.generateAsync({ type: 'blob' }), zipName);
            showNotification('success', `${imagesToExport.length} imagens exportadas`, 2000);
        } catch (error) {
            console.error('Failed to export ZIP:', error);
            showNotification('error', 'Erro ao exportar imagens');
        } finally { setIsExporting(false); }
    }, [isbn, showNotification]);

    const handleExportZip = useCallback(async (type: 'all' | 'used' | 'unused') => {
        const all = Array.from(images.values());
        const filtered = type === 'all' ? all : all.filter(img => type === 'used' ? img.usageCount > 0 : img.usageCount === 0);
        await exportImagesToZip(filtered, type === 'all' ? 'imagens.zip' : type === 'used' ? 'imagens_usadas.zip' : 'imagens_nao_usadas.zip');
    }, [images, exportImagesToZip]);

    const handleExportSelected = useCallback(async () => {
        if (selectedIds.size === 0) return;
        await exportImagesToZip(Array.from(selectedIds).map(id => images.get(id)).filter(Boolean) as ImageData[], 'imagens_selecionadas.zip');
    }, [selectedIds, images, exportImagesToZip]);

    const requestDeleteImage = useCallback((id: string) => setConfirmDeleteId(id), []);
    const cancelDeleteImage = useCallback(() => setConfirmDeleteId(null), []);

    const handleDeleteImage = useCallback(async (imageData: ImageData) => {
        setConfirmDeleteId(null);
        try {
            if (editorRef.current) {
                const newHtml = editorRef.current.removeImagesById([imageData.id]);
                if (newHtml !== undefined) onContentUpdate(newHtml);
            } else {
                const baseHtml = htmlContentRef.current;
                const newHtml = baseHtml.replace(new RegExp(`<img[^>]*data-image-id="${imageData.id}"[^>]*>`, 'g'), '');
                if (newHtml !== baseHtml) onContentUpdate(newHtml);
            }
            await ebooksApi.deleteImage(isbn, imageData.id);
            if (imageData.url) URL.revokeObjectURL(imageData.url);
            setImages(prev => { const m = new Map(prev); m.delete(imageData.id); return m; });
            showNotification('success', 'Imagem apagada com sucesso', 2000);
        } catch (error) {
            console.error('Failed to delete image:', error);
            showNotification('error', 'Erro ao apagar imagem');
        }
    }, [isbn, editorRef, onContentUpdate, showNotification]);

    const handleFileUpload = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setIsUploading(true);
        try {
            const formData = new FormData();
            let validCount = 0;
            Array.from(files).forEach(file => {
                if (file.type.startsWith('image/')) {
                    formData.append('images', file, file.name);
                    sanitizeImageFilename(file.name);
                    validCount++;
                }
            });
            if (validCount === 0) { showNotification('error', 'Nenhuma imagem válida selecionada'); return; }
            await ebooksApi.uploadImages(isbn, formData);
            const response = await ebooksApi.listImages(isbn);
            const newImages = new Map<string, ImageData>();
            response.data.images.forEach(img => {
                newImages.set(img.id, {
                    id: img.id, url: '', blob: null, loading: false, error: false,
                    size: img.size, dimensions: img.dimensions || undefined,
                    usageCount: countImageUsage(htmlContent, img.id),
                });
            });
            setImages(prev => {
                prev.forEach(img => { if (img.url) URL.revokeObjectURL(img.url); });
                return newImages;
            });
            showNotification('success', `${validCount} imagem(ns) carregada(s)`, 2000);
        } catch (error) {
            console.error('Failed to upload images:', error);
            showNotification('error', 'Erro ao carregar imagens');
        } finally { setIsUploading(false); }
    }, [isbn, htmlContent, countImageUsage, showNotification]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); handleFileUpload(e.dataTransfer.files);
    }, [handleFileUpload]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
    }, []);

    return {
        images, filteredImages, usedImageCount, unusedImageCount,
        searchQuery, setSearchQuery, searchExpanded, setSearchExpanded,
        filter, setFilter, activeDropdown, setActiveDropdown,
        renamingId, setRenamingId, newName, setNewName,
        selectedIds, isUploading, isExporting,
        lightboxImage, setLightboxImage,
        cropImage, handleOpenCrop, handleCropSave, handleCropCancel,
        filterMenuRef, exportMenuRef, searchInputRef,
        toggleSelection, clearSelection, selectAll,
        startRename, cancelRename, loadImage,
        handleDeleteSelected, handleExportSelected, handleExportZip,
        confirmDeleteId, requestDeleteImage, cancelDeleteImage,
        confirmDeleteSelected, requestDeleteSelected, cancelDeleteSelected,
        handleInsertAtCursor, handleLocateImage, handleRenameImage, handleReplaceImage,
        handleDeleteImage, handleFileUpload, handleDrop, handleDragOver,
    };
}
