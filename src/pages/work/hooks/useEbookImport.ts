import { useMutation } from '@tanstack/react-query';
import { ebooksApi } from '../../../api/ebooks-api';
import { extractHtmlFromPdf } from '../../../services/pdf-service';
import { extractDocument } from '../../../services/document-importer';
import type { DocxStyleMapping } from '../../../services/document-importer';
import { cleanEditorHtml, applyImportOptions, prependFichaTecnica } from '../../../utils/html-cleaner';
import type { ImportOptions } from '../../../utils/html-cleaner';
import type { ImageSettings } from '../../../components/MarginPreview';

interface UseEbookImportOptions {
    isbn: string | undefined;
    onImport: (html: string) => void;
    showNotification: (type: string, message: string) => void;
}

export function useEbookImport({ isbn, onImport, showNotification }: UseEbookImportOptions) {
    const importPdfMutation = useMutation({
        mutationFn: async ({
            file,
            headerMargin,
            footerMargin,
            imageSettings,
        }: {
            file: File;
            headerMargin: number;
            footerMargin: number;
            imageSettings: ImageSettings;
            options: ImportOptions;
        }) => {
            const result = await extractHtmlFromPdf(file, { headerMargin, footerMargin, imageSettings });
            let finalHtml = result.html;

            if (result.images.size > 0) {
                const formData = new FormData();
                for (const [id, img] of result.images.entries()) {
                    formData.append('images', img.blob, `${id}.png`);
                }
                await ebooksApi.uploadImages(isbn!, formData);

                for (const [id] of result.images.entries()) {
                    const serverUrl = `/api/ebooks/${isbn}/images/${id}`;
                    finalHtml = finalHtml.replace(
                        new RegExp(`<img[^>]*data-image-id="${id}"[^>]*>`, 'g'),
                        `<img data-image-id="${id}" src="${serverUrl}" alt="Imagem PDF" style="max-width: 100%; height: auto;" loading="lazy" />`
                    );
                }
            }
            return finalHtml;
        },
        onSuccess: (newHtml, variables) => {
            onImport(prependFichaTecnica(applyImportOptions(cleanEditorHtml(newHtml), variables.options)));
            showNotification('success', 'PDF importado com sucesso!');
        },
        onError: (error) => {
            console.error(error);
            showNotification('error', 'Erro ao importar PDF.');
        },
    });

    const importDocumentMutation = useMutation({
        mutationFn: async ({ file, options, styleMapping }: { file: File; options: ImportOptions; styleMapping?: DocxStyleMapping }) => {
            const result = await extractDocument(file, { convertListsToDialogue: options.convertListsToDialogue, styleMapping });
            let finalHtml = result.html;

            if (result.images.size > 0) {
                const formData = new FormData();
                for (const [id, blob] of result.images.entries()) {
                    // extensão real do blob (jpeg/png/…) — não forçar .png (jpeg da Links/ ficaria mal rotulado).
                    // EPS (application/postscript) → enviar como .eps; o servidor converte com Ghostscript.
                    const ext = blob.type === 'application/postscript' ? 'eps' : (blob.type.split('/')[1] || 'png');
                    formData.append('images', blob, `${id}.${ext}`);
                }
                await ebooksApi.uploadImages(isbn!, formData);

                for (const [id] of result.images.entries()) {
                    const serverUrl = `/api/ebooks/${isbn}/images/${id}`;
                    finalHtml = finalHtml.replace(
                        new RegExp(`<img[^>]*data-image-id="${id}"[^>]*>`, 'g'),
                        `<img data-image-id="${id}" src="${serverUrl}" alt="Imagem Importada" style="max-width: 100%; height: auto;" loading="lazy" />`
                    );
                }
            }
            return { html: finalHtml, pageBreaks: result.pageBreaks, figuresPlaced: result.figuresPlaced };
        },
        onSuccess: ({ html: newHtml, pageBreaks, figuresPlaced }, variables) => {
            // IDML/EPUB já vêm estruturados (estilos/classes nomeados, começam por heading
            // ou pela própria Ficha Técnica): saltar as conversões heurísticas e a Ficha
            // Técnica automática (que criaria um capítulo 0 vazio / duplicaria a ficha).
            const isStructured = /\.(idml|zip|epub)$/.test(variables.file.name.toLowerCase());
            const html = isStructured
                ? cleanEditorHtml(newHtml)
                : prependFichaTecnica(applyImportOptions(cleanEditorHtml(newHtml), variables.options));
            onImport(html);
            showNotification('success', 'Documento importado com sucesso!');
            if (pageBreaks) {
                showNotification('info', `Page-list: ${pageBreaks.inserted} de ${pageBreaks.total} páginas marcadas.`);
            }
            if (figuresPlaced) {
                showNotification('info', `${figuresPlaced} figura(s) colocada(s) com legenda.`);
            }
        },
        onError: (error) => {
            console.error(error);
            showNotification('error', 'Erro ao importar documento.');
        },
    });

    return { importPdfMutation, importDocumentMutation };
}
