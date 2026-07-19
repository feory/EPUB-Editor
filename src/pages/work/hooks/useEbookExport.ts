import { useState, useCallback } from 'react';
import { ebooksApi } from '../../../api/ebooks-api';
import { generateEpub, generateEpubBlob } from '../../../services/epub-service';

interface EbookMeta {
    title?: string;
    author?: string;
    description?: string;
    publisher?: string;
    language?: string;
    subjects?: string;
    pub_date?: string;
    physical_isbn?: string;
    ebook_isbn?: string;
}

interface UseEbookExportOptions {
    isbn: string | undefined;
    ebook: EbookMeta | undefined;
    getSyncedHtmlContent: () => string;
    customCss: string;
    showNotification: (type: string, message: string) => void;
}

export function useEbookExport({
    isbn,
    ebook,
    getSyncedHtmlContent,
    customCss,
    showNotification,
}: UseEbookExportOptions) {
    const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);

    const prepareEpubAssets = useCallback(async (html: string) => {
        const [imageMap, coverBlob] = await Promise.all([
            (async () => {
                const imageMap = new Map<string, Blob>();
                for (const match of html.matchAll(/data-image-id="([^"]+)"/g)) {
                    const id = match[1];
                    if (!imageMap.has(id)) {
                        try {
                            const res = await ebooksApi.getImage(isbn!, id);
                            imageMap.set(id, res.data);
                        } catch { /* image not on server */ }
                    }
                }
                for (const match of html.matchAll(/src=["']\/api\/ebooks\/[^/]+\/images\/([^"'?]+)/g)) {
                    const id = match[1];
                    if (!imageMap.has(id)) {
                        try {
                            const res = await ebooksApi.getImage(isbn!, id);
                            imageMap.set(id, res.data);
                        } catch { /* image not on server */ }
                    }
                }
                return imageMap;
            })(),
            (async () => {
                try {
                    const coverRes = await ebooksApi.getCover(isbn!);
                    return coverRes.data;
                } catch {
                    return null;
                }
            })(),
        ]);

        const metadata = {
            title: ebook?.title || '',
            author: ebook?.author || '',
            description: ebook?.description || '',
            publisher: ebook?.publisher || '',
            language: ebook?.language || 'pt',
            subjects: ebook?.subjects || '',
            pub_date: ebook?.pub_date || '',
            cover: coverBlob,
            images: imageMap,
            isbn,
            physical_isbn: ebook?.physical_isbn || '',
            ebook_isbn: ebook?.ebook_isbn || '',
        };

        return { metadata, imageMap, coverBlob };
    }, [isbn, ebook]);

    const handlePreview = useCallback(async () => {
        try {
            setIsPreviewing(true);
            const html = getSyncedHtmlContent();
            const { metadata } = await prepareEpubAssets(html);
            const blob = await generateEpubBlob(html, metadata, customCss);
            setPreviewBlob(blob);
        } catch (error) {
            console.error(error);
            showNotification('error', 'Falha ao gerar pré-visualização.');
        } finally {
            setIsPreviewing(false);
        }
    }, [getSyncedHtmlContent, prepareEpubAssets, customCss, showNotification]);

    const handleExport = useCallback(async () => {
        try {
            const html = getSyncedHtmlContent();
            const { metadata } = await prepareEpubAssets(html);
            const blob = await generateEpubBlob(html, metadata, customCss);
            await generateEpub(html, metadata, blob, customCss);
            showNotification('success', 'EPUB gerado e descarregado com sucesso!');
        } catch (error) {
            console.error(error);
            showNotification('error', 'Falha ao processar exportação.');
        }
    }, [getSyncedHtmlContent, prepareEpubAssets, customCss, showNotification]);

    return {
        previewBlob,
        isPreviewing,
        prepareEpubAssets,
        handlePreview,
        handleExport,
        closePreview: useCallback(() => setPreviewBlob(null), []),
    };
}
