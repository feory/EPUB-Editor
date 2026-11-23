import { ebooksApi } from '../../api/ebooks-api';
import { createPrintPdfStore } from '../../services/page-list/print-pdf';

/** O PDF de impressão do livro aberto, partilhado pelo assistente, pelo painel do PDF e pela importação (ver PrintPdfStore). */
export const printPdfs = createPrintPdfStore({
    download: async (isbn) => {
        const res = await ebooksApi.getPrintPdf(isbn);
        return res.status === 200 ? (res.data as ArrayBuffer) : null;
    },
    upload: (isbn, data) => ebooksApi.uploadPrintPdf(isbn, data),
});
