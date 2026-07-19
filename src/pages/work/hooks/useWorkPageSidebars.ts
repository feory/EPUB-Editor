import { useState, useCallback } from 'react';

type Panel = 'grammar' | 'validation' | 'imageGallery';

export function useWorkPageSidebars() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [showGrammarSidebar, setShowGrammarSidebar] = useState(false);
    const [showValidationSidebar, setShowValidationSidebar] = useState(false);
    const [showImageGallerySidebar, setShowImageGallerySidebar] = useState(false);

    const openPanel = useCallback((panel: Panel) => {
        setShowGrammarSidebar(panel === 'grammar');
        setShowValidationSidebar(panel === 'validation');
        setShowImageGallerySidebar(panel === 'imageGallery');
    }, []);

    const closeAllPanels = useCallback(() => {
        setShowGrammarSidebar(false);
        setShowValidationSidebar(false);
        setShowImageGallerySidebar(false);
    }, []);

    const togglePanel = useCallback((panel: Panel) => {
        setShowGrammarSidebar(prev => panel === 'grammar' ? !prev : false);
        setShowValidationSidebar(prev => panel === 'validation' ? !prev : false);
        setShowImageGallerySidebar(prev => panel === 'imageGallery' ? !prev : false);
        setIsSidebarOpen(false);
    }, []);

    return {
        isSidebarOpen, setIsSidebarOpen,
        showGrammarSidebar, setShowGrammarSidebar,
        showValidationSidebar, setShowValidationSidebar,
        showImageGallerySidebar, setShowImageGallerySidebar,
        openPanel, closeAllPanels, togglePanel,
    };
}
