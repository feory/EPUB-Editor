// O adapter de produção do histórico das alterações da IA: a API do servidor (ebooksApi) com o HTML comprimido como o resto da app.
import { ebooksApi } from '../../../api/ebooks-api';
import { compressHtmlAsync, decompressHtml } from '../../../utils/compression';
import type { AiHistoryPort } from './aiTransaction';

export const ebooksAiHistory = (isbn: string): AiHistoryPort => ({
    saveHtml: async (html) => (await ebooksApi.saveContent(isbn, await compressHtmlAsync(html))).data?.filename,
    labelHtml: async (filename, label) => { await ebooksApi.setHistoryLabel(isbn, filename, label); },
    saveCss: async (css, label) => (await ebooksApi.saveStyleSnapshot(isbn, css, label)).data.filename,
    readHtml: async (filename) => decompressHtml((await ebooksApi.getContent(isbn, filename)).data.content),
    readCss: async (filename) => (await ebooksApi.getStyleSnapshot(isbn, filename)).data.css,
    record: async (entry) => { await ebooksApi.addAiChange(isbn, entry); },
    markReverted: async (id) => { await ebooksApi.markAiChangeReverted(isbn, id); },
});
