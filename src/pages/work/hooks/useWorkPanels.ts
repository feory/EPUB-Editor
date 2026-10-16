import { useCallback } from 'react';
import type { Draft } from '../../../utils/local-draft';
import type { HistoryFile } from '../../../api/ebooks-api';
import type { useWorkPageSidebars, Panel } from './useWorkPageSidebars';
import type { useDiffComparison } from './useDiffComparison';
import type { useVersionDiff } from './useVersionDiff';

/**
 * Painéis laterais — dono de "o que está aberto à direita".
 * Os painéis (gramática, validação, galeria, PDF, comentários, caixa) e as duas comparações
 * (ficheiro, versões) ocupam o mesmo sítio: no máximo um aberto. Abrir qualquer um fecha os
 * outros AQUI, sem efeitos a reconciliar estados; a página usa só `open`/`toggle`/`closeAll`/`compare*`.
 */
export function useWorkPanels({ sidebars, diff, versionDiff, fullHtml }: {
    sidebars: ReturnType<typeof useWorkPageSidebars>;
    diff: ReturnType<typeof useDiffComparison>;
    versionDiff: ReturnType<typeof useVersionDiff>;
    fullHtml: string;
}) {
    const { openPanel, togglePanel, closeAllPanels, activePanel } = sidebars;
    const { closeDiffSidebar, handleCompareFile } = diff;
    const { close: closeVersions, compareWithEditor, compareDraft } = versionDiff;

    const closeComparisons = useCallback(() => { closeDiffSidebar(); closeVersions(); }, [closeDiffSidebar, closeVersions]);

    const open = useCallback((panel: Panel) => { closeComparisons(); openPanel(panel); }, [closeComparisons, openPanel]);
    const toggle = useCallback((panel: Panel) => {
        if (activePanel !== panel) closeComparisons();
        togglePanel(panel);
    }, [activePanel, closeComparisons, togglePanel]);
    const closeAll = useCallback(() => { closeAllPanels(); closeComparisons(); }, [closeAllPanels, closeComparisons]);

    // handleCompareFile fecha os painéis sozinho (onOpen do useDiffComparison).
    const compareFile = useCallback((file: File) => { closeVersions(); handleCompareFile(file); }, [closeVersions, handleCompareFile]);
    const compareHistory = useCallback((file: HistoryFile) => {
        closeDiffSidebar(); closeAllPanels();
        void compareWithEditor(file, fullHtml);
    }, [closeDiffSidebar, closeAllPanels, compareWithEditor, fullHtml]);
    const compareWithDraft = useCallback((draft: Draft) => {
        closeDiffSidebar(); closeAllPanels();
        void compareDraft(draft, fullHtml);
    }, [closeDiffSidebar, closeAllPanels, compareDraft, fullHtml]);

    return {
        open, toggle, closeAll, compareFile, compareHistory, compareWithDraft,
        anyOpen: !!activePanel || diff.showDiffSidebar || versionDiff.open,
    };
}
