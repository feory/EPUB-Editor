import { useMutation } from '@tanstack/react-query';
import { ebooksApi } from '../../../api/ebooks-api';
import { extractHtmlFromPdf } from '../../../services/pdf-service';
import { extractDocument } from '../../../services/document-importer';
import type { DocxStyleMapping } from '../../../services/document-importer';
import { cleanEditorHtml, applyImportOptions, prependFichaTecnica } from '../../../utils/html-cleaner';
import type { ImportOptions } from '../../../utils/html-cleaner';
import type { ImageSettings } from '../../../components/MarginPreview';
import { uploadExtractedImages } from '../../../services/extracted-images';

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
            const blobs = new Map([...result.images].map(([id, img]) => [id, img.blob]));
            return uploadExtractedImages(isbn!, result.html, blobs, fd => ebooksApi.uploadImages(isbn!, fd));
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
        mutationFn: async ({ file, options, styleMapping, epubClassMapping }: { file: File; options: ImportOptions; styleMapping?: DocxStyleMapping; epubClassMapping?: Record<string, string> }) => {
            const result = await extractDocument(file, { convertListsToDialogue: options.convertListsToDialogue, styleMapping, detectParagraphSpacing: options.detectParagraphSpacing, epubClassMapping });
            // Fire-and-forget: PDF de impressão do zip IDML, para o viewer lado a lado no editor.
            if (result.printPdf) ebooksApi.uploadPrintPdf(isbn!, result.printPdf).catch(() => {});

            const finalHtml = await uploadExtractedImages(isbn!, result.html, result.images, fd => ebooksApi.uploadImages(isbn!, fd));
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
