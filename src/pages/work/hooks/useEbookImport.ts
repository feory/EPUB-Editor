import { useMutation } from '@tanstack/react-query';
import { ebooksApi } from '../../../api/ebooks-api';
import { importFile } from '../../../services/import/import-file';
import type { DocxStyleMapping } from '../../../services/import/document-importer';
import type { ImportOptions } from '../../../utils/html-cleaner';
import type { ImageSettings } from '../../../components/MarginPreview';
import type { NotificationType } from '../../../context/NotificationContext';

interface UseEbookImportOptions {
    isbn: string | undefined;
    onImport: (html: string) => void;
    showNotification: (type: NotificationType, message: string) => void;
}

export function useEbookImport({ isbn, onImport, showNotification }: UseEbookImportOptions) {
    const ports = () => ({ isbn: isbn!, uploadImages: (fd: FormData) => ebooksApi.uploadImages(isbn!, fd) });

    const importPdfMutation = useMutation({
        mutationFn: async ({ file, headerMargin, footerMargin, imageSettings, options }: {
            file: File;
            headerMargin: number;
            footerMargin: number;
            imageSettings: ImageSettings;
            options: ImportOptions;
        }) => importFile(file, { options, pdf: { headerMargin, footerMargin, imageSettings } }, ports()),
        onSuccess: ({ html }) => {
            onImport(html);
            showNotification('success', 'PDF importado com sucesso!');
        },
        onError: (error) => {
            console.error(error);
            showNotification('error', 'Erro ao importar PDF.');
        },
    });

    const importDocumentMutation = useMutation({
        mutationFn: async ({ file, options, styleMapping, epubClassMapping }: { file: File; options: ImportOptions; styleMapping?: DocxStyleMapping; epubClassMapping?: Record<string, string> }) => {
            const result = await importFile(file, { options, styleMapping, epubClassMapping }, ports());
            // Fire-and-forget: PDF de impressão do zip IDML, para o viewer lado a lado no editor.
            if (result.printPdf) ebooksApi.uploadPrintPdf(isbn!, result.printPdf).catch(() => {});
            return result;
        },
        onSuccess: ({ html, pageBreaks, figuresPlaced }) => {
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
