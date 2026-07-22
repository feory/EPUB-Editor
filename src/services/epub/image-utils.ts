import type JSZip from 'jszip';

export type ImageEntry = { id: string; filename: string; mediaType: string };

const IMAGE_EXT_BY_TYPE: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
};

const getImageExtension = (blob: Blob): string => IMAGE_EXT_BY_TYPE[blob.type] || 'png';

const createImageFilename = (id: string, blob: Blob, includeFolder = true): string => {
    const ext = getImageExtension(blob);
    return includeFolder ? `Images/${id}.${ext}` : `${id}.${ext}`;
};

export const replaceImageUrlsInContent = (content: string, images: Map<string, Blob>): string => {
    if (images.size === 0) return content;
    // Pre-compute filenames once; then two passes total (not 2 new RegExp per image)
    const filenames = new Map<string, string>();
    images.forEach((blob, id) => filenames.set(id, createImageFilename(id, blob, true)));

    let processed = content.replace(/<img[^>]*?data-image-id=["']([^"']+)["'][^>]*?>/gi, (tag, id) => {
        const filename = filenames.get(id);
        if (!filename) return tag;
        const clsMatch = tag.match(/class=["']([^"']*)["']/i);
        const aligns = (clsMatch?.[1] || '').split(/\s+/).filter((c) => /^img-(left|right|center)$/.test(c));
        const classAttr = aligns.length ? ` class="${aligns.join(' ')}"` : '';
        // Tamanho definido pelo resize do TinyMCE (setSizeProp: width como atributo HTML,
        // height como style inline) — preservar, senão o resize não sobrevive ao preview/export.
        const styleMatch = tag.match(/\sstyle=["']([^"']*)["']/i);
        const widthMatch = tag.match(/\swidth=["']([^"']*)["']/i);
        const heightMatch = tag.match(/\sheight=["']([^"']*)["']/i);
        const sizeAttrs = (widthMatch ? ` width="${widthMatch[1]}"` : '')
            + (heightMatch ? ` height="${heightMatch[1]}"` : '')
            + (styleMatch ? ` style="${styleMatch[1]}"` : '');
        return `<img src="${filename}"${classAttr}${sizeAttrs} alt="Imagem ${id}" />`;
    });

    processed = processed.replace(/src=["']\/api\/ebooks\/[^/]+\/images\/([^"'?/]+)[^"']*["']/gi, (m, id) => {
        const filename = filenames.get(id);
        return filename ? `src="${filename}"` : m;
    });
    return processed;
};

export const addImagesToArchive = (
    images: Map<string, Blob>,
    imagesFolder: JSZip,
): { manifestItems: string; entries: ImageEntry[] } => {
    const entries: ImageEntry[] = [];
    images.forEach((blob, id) => {
        const filename = createImageFilename(id, blob, false);
        imagesFolder.file(filename, blob);
        entries.push({ id, filename: createImageFilename(id, blob, true), mediaType: blob.type });
    });
    const manifestItems = entries
        .map(({ id, filename, mediaType }) => `<item id="${id}" href="${filename}" media-type="${mediaType}"/>`)
        .join('\n    ');
    return { manifestItems, entries };
};
