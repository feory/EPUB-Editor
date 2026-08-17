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

// id do manifesto OPF tem de ser XML NCName: sem ":" etc. e sem começar por dígito (Xerces
// reporta sempre "without colons" mesmo quando o problema real é o dígito inicial — ids tipo
// "001" vindos de imagens numeradas de EPUBs antigos disparavam RSC-005 apesar de não terem ":").
const toNCName = (id: string): string => {
    const cleaned = id.replace(/[^A-Za-z0-9_-]/g, '_');
    return /^[A-Za-z_]/.test(cleaned) ? cleaned : `img-${cleaned}`;
};

const createImageFilename = (id: string, blob: Blob, includeFolder = true): string => {
    const ext = getImageExtension(blob);
    return includeFolder ? `Images/${id}.${ext}` : `${id}.${ext}`;
};

// Parágrafo cujo único conteúdo é uma imagem nunca resolvida (data-image-id sem blob
// correspondente — ficheiro apagado/nunca carregado): src fica literalmente "placeholder" mesmo
// depois de replaceImageUrlsInContent. Só sai no export/preview (o editor mantém-na visível,
// para o autor saber que há uma imagem por resolver).
const PLACEHOLDER_IMAGE_P = /<p\b[^>]*>\s*<img\b[^>]*\bsrc=["']placeholder["'][^>]*\/?>\s*<\/p>/gi;

export const stripPlaceholderImages = (content: string): string => content.replace(PLACEHOLDER_IMAGE_P, '');

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
        .map(({ id, filename, mediaType }) => `<item id="${toNCName(id)}" href="${filename}" media-type="${mediaType}"/>`)
        .join('\n    ');
    return { manifestItems, entries };
};
