// O adapter de produção do AiWorkspace (aiWorkspace.ts): liga a interface ao editor (`work`) e ao CSS do livro. O objeto é
// estável (não muda entre renders) e cada método lê o estado mais recente quando é chamado.
import { useMemo } from 'react';
import { ebooksApi } from '../../../api/ebooks-api';
import { isIndiceChapterTitle } from '../../../utils/indice-links';
import { useLive } from '../../../hooks/useLive';
import type { useEbookWork } from '../useEbookWork';
import type { AiWorkspace } from './aiWorkspace';
import type { AiCssSide } from './aiPlan';
import { locateBlocks } from './aiSelection';
import { collectFacts } from './publicationChecklist';
import { auditPageList, pageLinesFromPages } from '../../../services/page-list/audit';
import type { PrintPdf } from '../../../services/page-list/print-pdf';
import { printPdfs } from '../printPdfs';
import { auditText } from '../../../services/page-list/text-audit';

type Work = ReturnType<typeof useEbookWork>;

/** Corre `fn` sobre o PDF de impressão do livro e o HTML atual; null se não há PDF ou não se consegue lê-lo. O PDF é partilhado (ver printPdfs): lê-se uma vez, não por ferramenta. */
async function withPrintPdf<T>({ isbn, work }: { isbn: string | undefined; work: Work }, fn: (pdf: PrintPdf, html: string) => Promise<T>): Promise<T | null> {
    if (!isbn) return null;
    try {
        const entry = await printPdfs.get(isbn);
        return entry ? await fn(entry.pdf, work.getBookParts().join('')) : null;
    } catch { return null; }
}

export function useAiWorkspace({ isbn, work, css }: { isbn: string | undefined; work: Work; css: AiCssSide }): AiWorkspace {
    const live = useLive({ isbn, work, css });
    return useMemo<AiWorkspace>(() => ({
        title: () => live.current.work.ebook?.title ?? '',
        parts: () => live.current.work.getBookParts(),
        css: () => live.current.css.get(),
        language: () => live.current.work.language,
        readOnly: () => live.current.work.readOnly,
        apply: (plan, request, summary) => live.current.work.handleApplyAiPlan(plan, request, live.current.css, summary),
        revert: (change) => live.current.work.handleRevertAiChange(change, live.current.css),
        restore: (change) => live.current.work.handleRestoreAiChange(change, live.current.css),
        validate: async (kind) => (live.current.work.readOnly ? null : live.current.work.runValidation(kind)),
        publicationFacts: async () => {
            const { isbn, work } = live.current;
            if (!isbn || work.readOnly) return null;
            const hasCover = await ebooksApi.getCover(isbn).then(() => true, () => false);
            return collectFacts({
                ebook: work.ebook, hasCover, parts: work.getBookParts(),
                indiceTitles: work.chapters.filter((c) => isIndiceChapterTitle(c.title)).map((c) => c.title),
            });
        },
        pageListAudit: () => withPrintPdf(live.current, async (pdf, html) => auditPageList(await pdf.pages(), html)),
        pageLines: () => withPrintPdf(live.current, async (pdf, html) => pageLinesFromPages(await pdf.pages(), html)),
        pdfStyles: () => withPrintPdf(live.current, (pdf) => pdf.styles()),
        textAudit: () => withPrintPdf(live.current, async (pdf, html) => auditText(await pdf.pages(), html)),
        compressImages: async (opts) => {
            const { isbn, work } = live.current;
            if (!isbn || work.readOnly) return null;
            return ebooksApi.compressImages(isbn, opts).then((r) => r.data, () => null);
        },
        locate: (selection) => locateBlocks(live.current.work.getBookParts(), selection, live.current.work.activeChapterIndex),
    }), [live]);
}
