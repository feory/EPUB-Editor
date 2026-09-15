import { useState, useCallback } from 'react';

type Panel = 'grammar' | 'validation' | 'imageGallery' | 'printPdf' | 'comments';

// Um único painel lateral aberto de cada vez — activePanel substitui 5 booleans paralelos
// que tinham de ser mantidos mutuamente exclusivos à mão em openPanel/closeAllPanels/togglePanel.
export function useWorkPageSidebars() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [activePanel, setActivePanel] = useState<Panel | null>(null);

    const openPanel = useCallback((panel: Panel) => setActivePanel(panel), []);
    const closeAllPanels = useCallback(() => setActivePanel(null), []);
    const togglePanel = useCallback((panel: Panel) => {
        setActivePanel(prev => prev === panel ? null : panel);
        setIsSidebarOpen(false);
    }, []);

    // setShowXSidebar(bool) — API mantida para os call-sites existentes (todos só fecham
    // com `false`); abrir um painel específico continua a ser feito via openPanel/togglePanel.
    const setPanelOpen = (panel: Panel) => (open: boolean) => setActivePanel(open ? panel : null);

    return {
        isSidebarOpen, setIsSidebarOpen,
        activePanel,
        showGrammarSidebar: activePanel === 'grammar',
        setShowGrammarSidebar: setPanelOpen('grammar'),
        showValidationSidebar: activePanel === 'validation',
        setShowValidationSidebar: setPanelOpen('validation'),
        showImageGallerySidebar: activePanel === 'imageGallery',
        setShowImageGallerySidebar: setPanelOpen('imageGallery'),
        showPrintPdfSidebar: activePanel === 'printPdf',
        setShowPrintPdfSidebar: setPanelOpen('printPdf'),
        showCommentsSidebar: activePanel === 'comments',
        setShowCommentsSidebar: setPanelOpen('comments'),
        openPanel, closeAllPanels, togglePanel,
    };
}
