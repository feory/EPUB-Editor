import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ebooksApi } from '../../../api/ebooks-api';
import { extractFile, finalizeImport, type ImportDecisions } from '../../../services/import/import-file';
import { useStyles, DEFAULT_CSS } from '../../../context/StyleContext';
import type { DocxStyleMapping } from '../../../services/import/document-importer';
import type { ImportOptions } from '../../../utils/html-cleaner';
import type { ImageSettings } from '../../../components/MarginPreview';
import type { NotificationType } from '../../../context/NotificationContext';
import { bustImageSrcs } from '../../../utils/book-image';

interface UseEbookImportOptions {
    isbn: string | undefined;
    onImport: (html: string) => void;
    showNotification: (type: NotificationType, message: string) => void;
}

export function useEbookImport({ isbn, onImport, showNotification }: UseEbookImportOptions) {
    const queryClient = useQueryClient();
    const { setCustomCss } = useStyles();
    const ports = () => ({ isbn: isbn!, uploadImages: (fd: FormData) => ebooksApi.uploadImages(isbn!, fd) });

    // Importar dentro de um projeto = recomeçar do zero: imagens, comentários e CSS antigos saem. Corre DEPOIS
    // da extração (um ficheiro inválido não apaga nada). Só se apagam as imagens que NÃO voltam a ser enviadas:
    // apagar e re-subir o mesmo id deixava uma janela de 404 em que o editor pedia o URL, e o browser guardava
    // a falha — as imagens novas ficavam partidas até recarregar a página.
    const clearOldProject = async (keepImageIds: Set<string>) => {
        const [images, comments] = await Promise.all([ebooksApi.listImages(isbn!), ebooksApi.getComments(isbn!)]);
        await Promise.allSettled([
            ...images.data.images.filter(i => !keepImageIds.has(i.id)).map(i => ebooksApi.deleteImage(isbn!, i.id)),
            // o servidor só deixa apagar os próprios comentários (admin: todos); as respostas saem com a raiz
            ...comments.data.comments.filter(c => c.parent_id === null).map(c => ebooksApi.deleteComment(isbn!, c.id)),
        ]);
        queryClient.invalidateQueries({ queryKey: ['ebook-comments', isbn] });
    };

    const importFromScratch = async (file: File, decisions: ImportDecisions) => {
        const extracted = await extractFile(file, decisions);
        await clearOldProject(new Set(extracted.images.keys()));
        const result = await finalizeImport(extracted, decisions, ports());
        // Mesmo id = mesmo src: o editor reaproveitava da memória as imagens do import anterior (e só recarregar
        // mostrava as novas). `?v=` força o pedido — o mesmo cache-bust do editor ao cortar/substituir imagens.
        result.html = bustImageSrcs(result.html);
        await ebooksApi.saveStyle(isbn!, DEFAULT_CSS);
        setCustomCss(DEFAULT_CSS);
        return result;
    };

    const importPdfMutation = useMutation({
        mutationFn: async ({ file, headerMargin, footerMargin, imageSettings, options }: {
            file: File;
            headerMargin: number;
            footerMargin: number;
            imageSettings: ImageSettings;
            options: ImportOptions;
        }) => importFromScratch(file, { options, pdf: { headerMargin, footerMargin, imageSettings } }),
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
            const result = await importFromScratch(file, { options, styleMapping, epubClassMapping });
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
