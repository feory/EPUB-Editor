import { useMemo, type MutableRefObject } from 'react';
import { useLive } from '../../../hooks/useLive';
import { syncAction, type SyncEvent } from '../../../services/page-list/pdf-sync';

interface PdfSyncInputs {
    free: boolean;
    ready: boolean;
    mapsReady: boolean;
    pageCountRef: MutableRefObject<number>;
    folioToPageRef: MutableRefObject<ReadonlyMap<number, number>>;
    pageToFolioRef: MutableRefObject<ReadonlyMap<number, number>>;
    setPage: (page: number) => void;
    onPageClick?: (folio: number) => void;
    getEditorFolio?: () => number | null;
}

/**
 * Liga as regras de pdf-sync.ts ao leitor: `send(evento)` lê o estado mais recente (sem depender do render, por isso é estável e os efeitos só
 * disparam pelo que importa), pede a ação e aplica-a (a página do PDF e/ou o folio a que levar o editor). `opened()` abre onde o editor está.
 */
export function usePdfSync(inputs: PdfSyncInputs) {
    const live = useLive(inputs);
    return useMemo(() => {
        const send = (event: SyncEvent) => {
            const l = live.current;
            const action = syncAction({ free: l.free, ready: l.ready, pageCount: l.pageCountRef.current, mapsReady: l.mapsReady, folioToPage: l.folioToPageRef.current, pageToFolio: l.pageToFolioRef.current }, event);
            if (action.page !== undefined) l.setPage(action.page);
            if (action.editorFolio !== undefined) l.onPageClick?.(action.editorFolio);
        };
        return { send, opened: () => send({ type: 'opened', editorFolio: live.current.getEditorFolio?.() ?? null }) };
    }, [live]);
}
