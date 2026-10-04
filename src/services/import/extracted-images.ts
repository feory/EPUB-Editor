// Imagens extraídas pelos importadores (EPUB, IDML, Word, PDF) → servidor.
// Todos os extratores marcam a imagem como <img data-image-id="{id}" src="placeholder" …>; aqui sobe-se o blob
// e troca-se SÓ o src pelo URL do servidor — alt, class e o resto do que o extrator produziu ficam.

// Extensão real do blob (jpeg/png/…). EPS → .eps (servidor rasteriza com Ghostscript); PSD → .psd (ImageMagick).
export function uploadName(id: string, blob: Blob): string {
    const ext = blob.type === 'application/postscript' ? 'eps'
        : blob.type === 'image/vnd.adobe.photoshop' ? 'psd'
        : (blob.type.split('/')[1] || 'png');
    return `${id}.${ext}`;
}

// src="placeholder" → /api/ebooks/{isbn}/images/{id}, independente da ordem dos atributos.
// Sem alt → alt genérico (o Ace exige alt; alt="" de imagem decorativa é mantido).
export function pointImagesToServer(html: string, isbn: string): string {
    return html.replace(/<img\b[^>]*>/gi, (tag) => {
        const id = tag.match(/data-image-id="([^"]+)"/)?.[1];
        if (!id) return tag;
        const out = tag.replace(/\bsrc="placeholder"/, `src="/api/ebooks/${isbn}/images/${id}"`);
        return /\balt=/.test(out) ? out : out.replace(/^<img\b/i, '<img alt="Imagem importada"');
    });
}

export async function uploadExtractedImages(
    isbn: string, html: string, images: Map<string, Blob>, upload: (fd: FormData) => Promise<unknown>,
): Promise<string> {
    if (!images.size) return html;
    const fd = new FormData();
    for (const [id, blob] of images) fd.append('images', blob, uploadName(id, blob));
    await upload(fd);
    return pointImagesToServer(html, isbn);
}
