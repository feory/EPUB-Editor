// O adapter de produção do AiWorkspace (aiWorkspace.ts): liga a interface ao editor (`work`) e ao CSS do livro. O objeto é
// estável (não muda entre renders) e cada método lê o estado mais recente quando é chamado.
import { useMemo } from 'react';
import { ebooksApi } from '../../../api/ebooks-api';
import { isIndiceChapterTitle } from '../../../utils/indice-links';
import { useLive } from '../editor/liveProps';
import type { useEbookWork } from '../useEbookWork';
import type { AiWorkspace } from './aiWorkspace';
import type { AiCssSide } from './aiPlan';
import { locateBlocks } from './aiSelection';
import { collectFacts } from './publicationChecklist';

type Work = ReturnType<typeof useEbookWork>;

export function useAiWorkspace({ isbn, work, css }: { isbn: string | undefined; work: Work; css: AiCssSide }): AiWorkspace {
    const live = useLive({ isbn, work, css });
    return useMemo<AiWorkspace>(() => ({
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
        locate: (selection) => locateBlocks(live.current.work.getBookParts(), selection, live.current.work.activeChapterIndex),
    }), [live]);
}
