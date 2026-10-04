import type { ebooksApi } from '../../api/ebooks-api';
import { extractEpub } from './epub-importer';
import { uploadExtractedImages } from './extracted-images';
import { cleanEditorHtml } from '../../utils/html-cleaner';
import { compressHtml } from '../../utils/compression';

export type ImportEpubApi = Pick<typeof ebooksApi, 'create' | 'uploadCover' | 'uploadImages' | 'saveContent' | 'updateMetadata'>;

// O servidor guarda a capa como cover.jpg e recusa > 3 MB: JPEG pequeno passa tal e qual; o resto
// (PNG, ou JPEG grande — ex. capas de 5 MB do InDesign) é reduzido para JPEG no browser.
const MAX_COVER_BYTES = 2_900_000;
async function coverForUpload(blob: Blob): Promise<Blob> {
    if (blob.type === 'image/jpeg' && blob.size <= MAX_COVER_BYTES) return blob;
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.7]) {
        const jpeg = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
        if (jpeg && jpeg.size <= MAX_COVER_BYTES) return jpeg;
    }
    throw new Error('capa demasiado grande');
}

// Importa um EPUB como ebook novo: cria o registo, capa, imagens, conteúdo e metadados. Devolve o ISBN.
// Erros da API propagam (ex. 409 = ISBN já existe), exceto a capa, que nunca bloqueia a importação.
export async function importEpub(file: File, mapping: Record<string, string> | undefined, api: ImportEpubApi): Promise<string> {
    const { html, images, metadata, cover } = await extractEpub(file, mapping);
    const isbn = metadata?.ebook_isbn || file.name.replace(/\.epub$/i, '');
    // O servidor exige title+author não-vazios; fallback quando o OPF não os traz.
    const title = metadata?.title || file.name.replace(/\.epub$/i, '');
    const author = metadata?.author || '—';
    const physical_isbn = metadata?.physical_isbn || '';
    await api.create({ ebook_isbn: isbn, physical_isbn, title, author });
    if (cover) {
        try {
            const fd = new FormData();
            fd.append('cover', await coverForUpload(cover), 'cover.jpg');
            await api.uploadCover(isbn, fd);
        } catch { /* sem capa: o utilizador pode pô-la depois no botão de capa */ }
    }
    const finalHtml = await uploadExtractedImages(isbn, cleanEditorHtml(html), images, fd => api.uploadImages(isbn, fd));
    await api.saveContent(isbn, compressHtml(finalHtml));
    if (metadata) await api.updateMetadata(isbn, {
        title, author, description: metadata.description,
        publisher: metadata.publisher, language: metadata.language, subjects: metadata.subjects,
        pub_date: metadata.pub_date, physical_isbn,
    });
    return isbn;
}
