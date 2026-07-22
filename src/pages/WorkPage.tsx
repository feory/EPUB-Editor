import { useState, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ebooksApi } from '../api/ebooks-api';
import { Loader2 } from 'lucide-react';
import { MarginPreview } from '../components/MarginPreview';
import { ImportOptionsModal } from './work/modals/ImportOptionsModal';
import { ConversionsModal } from './work/modals/ConversionsModal';
import { EpubMappingModal } from './EpubMappingModal';
import { scanEpubClasses } from '../services/epub-importer';
import type { EpubClassInfo } from '../services/epub-importer';
import type { ImportOptions } from '../utils/html-cleaner';
import type { DocxStyleMapping } from '../services/document-importer';
import { useEbookWork } from './work/useEbookWork';
import { WorkToolbar } from './work/components/WorkToolbar';
import { WorkEditor } from './work/components/WorkEditor';
import type { WorkEditorRef } from './work/components/WorkEditor';
import { ChapterSidebar } from './work/components/ChapterSidebar';
import { TocModal } from './work/components/TocModal';
import { FocusModeBar } from './work/components/FocusModeBar';
import { GrammarSidebar } from './work/components/GrammarSidebar';
import { ValidationSidebar } from './work/components/ValidationSidebar';
import { ImageGallerySidebar } from './work/components/ImageGallerySidebar';
import { DiffSidebar } from './work/components/DiffSidebar';
import { useDiffComparison } from './work/hooks/useDiffComparison';
import { useWorkPageSidebars } from './work/hooks/useWorkPageSidebars';
import { useNotification } from '../context/NotificationContext';
import { useStyles, DEFAULT_CSS, patchLoadedCss } from '../context/StyleContext';
import { sanitizeImageFilename } from '../utils/format';
import { getStoredFont, storeFont, getStoredFontSize, storeFontSize } from './work/utils/editorFonts';
import ErrorBoundary from '../components/ErrorBoundary';

const HistoryModal = lazy(() => import('./work/components/WorkModals').then(m => ({ default: m.HistoryModal })));
const CompareModal = lazy(() => import('./work/components/WorkModals').then(m => ({ default: m.CompareModal })));
const ShortcutsModal = lazy(() => import('./work/components/WorkModals').then(m => ({ default: m.ShortcutsModal })));
const StatisticsModal = lazy(() => import('./work/components/WorkModals').then(m => ({ default: m.StatisticsModal })));
const EpubPreviewModal = lazy(() => import('./work/components/EpubPreviewModal').then(m => ({ default: m.EpubPreviewModal })));
const StyleEditorModal = lazy(() => import('./work/components/StyleEditorModal').then(m => ({ default: m.StyleEditorModal })));
const FontModal = lazy(() => import('./work/components/FontModal').then(m => ({ default: m.FontModal })));

function ModalLoadingFallback() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Loader2 className="animate-spin text-white" size={32} />
    </div>
  );
}

export function WorkPage() {
  const { isbn } = useParams<{ isbn: string }>();
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const { setCustomCss } = useStyles();
  const work = useEbookWork(isbn);

  useEffect(() => {
    if (work.status === 'completed') {
      showNotification('info', 'Ebook concluído — apenas disponível para download.');
      navigate('/');
    }
  }, [work.status, navigate, showNotification]);

  useEffect(() => {
    if (!isbn) return;
    let cancelled = false;
    ebooksApi.getStyle(isbn)
      .then(res => { if (!cancelled) setCustomCss(patchLoadedCss(res.data as unknown as string)); })
      .catch(() => { if (!cancelled) setCustomCss(DEFAULT_CSS); });
    return () => { cancelled = true; };
  }, [isbn, setCustomCss]);

  const editorRef = useRef<WorkEditorRef>(null);
  const suppressHighlightRef = useRef(false);

  const [isDragOver, setIsDragOver] = useState(false);
  const [galleryRefreshKey, setGalleryRefreshKey] = useState(0);
  const refreshGallery = useCallback(() => setGalleryRefreshKey(k => k + 1), []);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions | null>(null);
  const [epubMapping, setEpubMapping] = useState<{ file: File; classes: EpubClassInfo[] } | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [showFonts, setShowFonts] = useState(false);
  const [editorFont, setEditorFont] = useState<string>(getStoredFont);
  const [editorFontSize, setEditorFontSize] = useState<string>(getStoredFontSize);
  const [showConversions, setShowConversions] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [grammarFilter, setGrammarFilter] = useState<'all' | 'spelling' | 'grammar'>('all');
  const [grammarChoiceOpen, setGrammarChoiceOpen] = useState(false);
  const [selectedGrammarIndex, setSelectedGrammarIndex] = useState<number | null>(null);
  const [freedDismissed, setFreedDismissed] = useState(false);

  const sidebars = useWorkPageSidebars();

  const diff = useDiffComparison({
    htmlContent: work.htmlContent,
    editorRef,
    onOpen: () => {
      sidebars.closeAllPanels();
      sidebars.setIsSidebarOpen(false);
    },
  });

  const handleToggleSidebar = useCallback(() => {
    sidebars.setIsSidebarOpen(v => !v);
  }, [sidebars]);

  // Focus mode
  const handleToggleFocusMode = useCallback(() => {
    setIsFocusMode(prev => {
      if (!prev) {
        sidebars.closeAllPanels();
        sidebars.setIsSidebarOpen(false);
        diff.closeDiffSidebar();
      }
      return !prev;
    });
  }, [sidebars, diff]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocusMode) setIsFocusMode(false);
      if (e.key === 'F' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleToggleFocusMode();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFocusMode, handleToggleFocusMode]);

  // Auto-open validation sidebar when results arrive; close it when they clear
  // (e.g. another validator returns no errors) so the reserved space is released.
  useEffect(() => {
    if (work.validationResults || work.footnoteValidation || work.linkValidation) {
      sidebars.openPanel('validation');
    } else {
      sidebars.setShowValidationSidebar(false);
    }
  }, [work.validationResults, work.footnoteValidation, work.linkValidation]);

  // Grammar highlights
  useEffect(() => {
    if (suppressHighlightRef.current) { suppressHighlightRef.current = false; return; }
    if (editorRef.current && sidebars.showGrammarSidebar) {
      editorRef.current.highlightGrammarErrors(work.grammarIssues);
      editorRef.current.filterGrammarHighlights(grammarFilter);
    } else if (editorRef.current && !sidebars.showGrammarSidebar) {
      editorRef.current.clearGrammarErrors();
      // Reset legítimo da seleção local ao fechar a sidebar de gramática (sincroniza com o toggle externo).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedGrammarIndex(null);
    }
  }, [work.grammarIssues, sidebars.showGrammarSidebar, work.activeChapterIndex]);

  useEffect(() => {
    if (editorRef.current && sidebars.showGrammarSidebar) {
      editorRef.current.filterGrammarHighlights(grammarFilter);
    }
  }, [grammarFilter]);

  // Abrir um painel lateral (gramática/validação/galeria) esconde os painéis de diff.
  const closeDiffSidebar = diff.closeDiffSidebar;
  const closeVersionDiff = work.versionDiff.close;
  useEffect(() => {
    if (sidebars.showGrammarSidebar || sidebars.showValidationSidebar || sidebars.showImageGallerySidebar) {
      closeDiffSidebar();
      closeVersionDiff();
    }
  }, [sidebars.showGrammarSidebar, sidebars.showValidationSidebar, sidebars.showImageGallerySidebar, closeDiffSidebar, closeVersionDiff]);

  // Inverso: abrir a comparação (diff de ficheiro ou de versões) fecha os painéis laterais.
  const closeAllPanels = sidebars.closeAllPanels;
  useEffect(() => {
    if (diff.showDiffSidebar || work.versionDiff.open) closeAllPanels();
  }, [diff.showDiffSidebar, work.versionDiff.open, closeAllPanels]);

  // File handling
  // EPUB antigo (mesma plataforma legacy que a HomePage já trata) → modal de mapeamento de
  // classes primeiro; EPUB da própria app → segue direto para as Opções de Importação, como
  // os outros formatos. scanEpubClasses só faz algo em EPUBs de plataforma antiga.
  const processFile = useCallback((file: File) => {
    const isPdf = file.type === 'application/pdf';
    const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx');
    const isHtml = file.type === 'text/html' || file.name.endsWith('.html') || file.name.endsWith('.htm');
    const isIdml = file.name.endsWith('.idml') || file.name.endsWith('.zip');
    const isEpub = file.name.endsWith('.epub');
    if (!(isPdf || isDocx || isHtml || isIdml || isEpub)) {
      showNotification('error', 'Formato não suportado. Use PDF, DOCX, IDML/ZIP, EPUB ou HTML.');
      return;
    }
    if (!isEpub) { setPendingImportFile(file); return; }
    scanEpubClasses(file)
      .then(({ legacy, classes }) => {
        if (legacy && classes.length) setEpubMapping({ file, classes });
        else setPendingImportFile(file);
      })
      .catch(() => setPendingImportFile(file)); // scan falhou → best-effort direto
  }, [showNotification]);

  const handleImportConfirm = (options: ImportOptions, styleMapping?: DocxStyleMapping) => {
    const file = pendingImportFile;
    setPendingImportFile(null);
    if (!file) return;
    if (file.type === 'application/pdf') {
      setImportOptions(options);
      setCurrentFile(file);
      setShowPreview(true);
    } else {
      work.handleImportDocument(file, options, styleMapping);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // sem isto, escolher o MESMO ficheiro outra vez não dispara onChange
    if (file) processFile(file);
  };

  const handleImageFileDrop = useCallback(async (file: File) => {
    if (!isbn) return;
    const { filename, imageId } = sanitizeImageFilename(file.name);
    const formData = new FormData();
    formData.append('images', file, filename);
    await ebooksApi.uploadImages(isbn, formData);
    editorRef.current?.insertContent(
      `<img data-image-id="${imageId}" src="/api/ebooks/${isbn}/images/${imageId}" alt="Imagem" style="max-width: 100%; height: auto;" loading="lazy" />`
    );
    refreshGallery();
  }, [isbn, refreshGallery]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith('image/')) { handleImageFileDrop(file); return; }
    processFile(file);
  }, [handleImageFileDrop, processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);

  const handleGoToIssue = (context: string, paragraphIndex?: number) => {
    editorRef.current?.scrollToContent(context, paragraphIndex);
  };

  const handleFixLinks = () => {
    const n = editorRef.current?.fixLinkSpacing() ?? 0;
    showNotification(
      n > 0 ? 'success' : 'info',
      n > 0
        ? `${n} ${n === 1 ? 'link corrigido' : 'links corrigidos'} no capítulo atual.`
        : 'Nenhum link para corrigir no capítulo atual.'
    );
    // Validar de novo, já com o conteúdo corrigido (síncrono, do editor — sem
    // depender do debounce de sincronização).
    const report = editorRef.current?.getLinkReport() ?? null;
    work.setLinkValidation(report && report.issues.length > 0 ? report : null);
  };

  const handleGrammarCheck = (matches: unknown[], cache?: Record<string, unknown>) => {
    work.setGrammarIssues(matches);
    if (cache !== undefined) work.handleSaveGrammar(matches, cache);
    if (!sidebars.showGrammarSidebar) sidebars.openPanel('grammar');
  };

  const handleGrammarValidation = useCallback(() => {
    if (work.grammarIssues.length > 0) {
      setGrammarChoiceOpen(true);
    } else {
      sidebars.openPanel('grammar');
      diff.closeDiffSidebar();
      editorRef.current?.triggerGrammarCheck();
    }
  }, [work.grammarIssues.length, sidebars, diff]);

  // Callbacks estáveis de useEbookGrammar (via work) — deps estáveis para os useCallback.
  const { handleResolveIssue: resolveIssue, handleResolveMultiple: resolveMultiple } = work;

  const handleResolveIssue = useCallback((index: number) => {
    suppressHighlightRef.current = true;
    editorRef.current?.removeGrammarHighlights(new Set([index]));
    resolveIssue(index);
  }, [resolveIssue]);

  const handleResolveMultiple = useCallback((indices: number[]) => {
    suppressHighlightRef.current = true;
    editorRef.current?.removeGrammarHighlights(new Set(indices));
    resolveMultiple(indices);
  }, [resolveMultiple]);

  const handleApplySuggestion = (index: number, suggestion: string) => {
    if (editorRef.current) {
      suppressHighlightRef.current = true;
      editorRef.current.applyGrammarSuggestion(index, suggestion);
      work.handleResolveIssue(index);
      showNotification('success', 'Sugestão aplicada!', 2000);
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      const [datePart, timePart] = ts.split('T');
      if (!timePart) return ts;
      const timeClean = timePart.replace(/-/g, ':').replace(/:(\d{3}Z)$/, '.$1');
      return new Date(`${datePart}T${timeClean}`).toLocaleString('pt-PT');
    } catch { return ts; }
  };

  const anySidebarOpen = sidebars.showGrammarSidebar || sidebars.showValidationSidebar || sidebars.showImageGallerySidebar || diff.showDiffSidebar || work.versionDiff.open;

  const presence = work.presence;
  const presenceBanner = work.readOnly
    ? (presence.freed
      ? { tone: 'amber', text: 'Edição libertada — recarregue a página para começar a editar.' }
      : { tone: 'amber', text: `Modo leitura — ${presence.holderEmail ?? 'outro utilizador'} está a editar este projeto.` })
    : (presence.others.length > 0
      ? { tone: 'slate', text: `${presence.others.join(', ')} também está a ver este projeto.` }
      : null);

  return (
    <div className="flex flex-col min-h-screen bg-bg-color">
      {presenceBanner && (
        <div className={`w-full px-6 py-2 text-sm font-semibold text-center ${presenceBanner.tone === 'amber'
            ? 'bg-amber-100 text-amber-800 border-b border-amber-200'
            : 'bg-slate-100 text-slate-700 border-b border-slate-200'
          }`}>
          {presenceBanner.text}
        </div>
      )}
      {!isFocusMode && (
        <WorkToolbar
          isLoading={work.isLoading}
          htmlContent={work.htmlContent}
          lastSaved={work.lastSaved}
          onSave={work.saveContent}
          onFetchHistory={work.fetchHistory}
          onValidate={work.handleValidate}
          onValidateEpub={work.handleValidateEpub}
          onValidateAccessibility={work.handleValidateAccessibility}
          onValidateLinks={work.handleValidateLinks}
          onPreview={work.handlePreview}
          onExport={work.handleExportEpub}
          onFileSelect={handleFileUpload}
          onToggleGrammar={handleGrammarValidation}
          onToggleImageGallery={() => {
            sidebars.togglePanel('imageGallery');
            if (!sidebars.showImageGallerySidebar) diff.closeDiffSidebar();
          }}
          onOpenCompare={() => { setShowCompare(true); work.refetchHistory(); }}
          onShowShortcuts={() => setShowShortcuts(true)}
          onShowStats={() => setShowStats(true)}
          onShowStyleEditor={() => setShowStyleEditor(true)}
          onShowFonts={() => setShowFonts(true)}
          onCleanIndex={() => editorRef.current?.cleanIndexSelection()}
          onConversions={() => setShowConversions(true)}
          onEditToc={() => setShowToc(true)}
          readOnly={work.readOnly}
        />
      )}

      {isFocusMode && (
        <FocusModeBar
          title={work.title}
          lastSaved={work.lastSaved}
          isLoading={work.isLoading}
          hasContent={!!work.htmlContent}
          onSave={work.saveContent}
          onExit={handleToggleFocusMode}
        />
      )}

      <main className={`flex-1 w-full transition-all duration-500 ease-in-out ${isFocusMode
          ? 'py-16 max-w-[1200px] mx-auto px-8'
          : anySidebarOpen
            ? 'py-8 max-w-none px-12 pr-[520px] ml-0'
            : (sidebars.isSidebarOpen ? 'py-8 max-w-[1400px] mx-auto px-6' : 'py-8 max-w-7xl mx-auto px-6')
        }`}>
        {showPreview && currentFile ? (
          <MarginPreview
            file={currentFile}
            onConfirm={(h, f, settings) => { setShowPreview(false); work.handleImportPdf(currentFile, h, f, settings, importOptions ?? { indentAllParagraphs: false, topOnBoldParagraphs: false, noIndentAfterBold: false, wrapBoldWithNext: false, convertListsToDialogue: false }); setCurrentFile(null); setImportOptions(null); }}
            onCancel={() => { setShowPreview(false); setCurrentFile(null); setImportOptions(null); }}
          />
        ) : (
          <div className="flex gap-4 items-start relative">
            <ChapterSidebar
              chapters={work.chapters}
              activeChapterIndex={work.activeChapterIndex}
              isFocusMode={isFocusMode}
              isSidebarOpen={sidebars.isSidebarOpen}
              onToggleSidebar={handleToggleSidebar}
              onSelectChapter={work.setActiveChapterIndex}
              onEditChapterTitle={work.handleEditChapterTitle}
              onReorderChapter={work.handleReorderChapter}
              onDeleteChapter={work.handleDeleteChapter}
              readOnly={work.readOnly}
            />

            <div className="min-w-0 transition-all duration-300 flex-1 relative">
              {work.isLoadingChapter && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center rounded-2xl">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-primary" />
                    <p className="text-sm font-semibold text-slate-600">A carregar capítulo...</p>
                  </div>
                </div>
              )}
              <WorkEditor
                ref={editorRef}
                isbn={isbn}
                title={work.title}
                onToggleFocusMode={handleToggleFocusMode}
                isFocusMode={isFocusMode}
                htmlContent={work.htmlContent}
                setHtmlContent={work.setHtmlContent}
                activeChapterIndex={work.activeChapterIndex}
                chapters={work.chapters}
                isDragOver={isDragOver}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onGrammarCheck={handleGrammarCheck}
                onGrammarClick={(index) => setSelectedGrammarIndex(index)}
                onSave={work.saveContent}
                onExport={work.handleExportEpub}
                onUndo={work.undo}
                onRedo={work.redo}
                grammarCache={work.grammarCache}
                onImageUploaded={refreshGallery}
                readOnly={work.readOnly}
                editorFont={editorFont}
                editorFontSize={editorFontSize}
              />
            </div>
          </div>
        )}
      </main>

      {sidebars.showGrammarSidebar && (
        <GrammarSidebar
          issues={work.grammarIssues}
          onClose={() => sidebars.setShowGrammarSidebar(false)}
          onGoToIssue={handleGoToIssue}
          onRecheck={() => { }}
          onClearHighlights={() => editorRef.current?.clearGrammarErrors()}
          onResolveIssue={handleResolveIssue}
          onApplySuggestion={handleApplySuggestion}
          onResolveMultiple={handleResolveMultiple}
          filter={grammarFilter}
          onFilterChange={setGrammarFilter}
          selectedErrorIndex={selectedGrammarIndex}
        />
      )}

      {work.versionDiff.open ? (
        <DiffSidebar
          items={work.versionDiff.diffItems}
          fileName={work.versionDiff.labels ? `${formatTimestamp(work.versionDiff.labels.history)} → atual` : 'Histórico'}
          isLoading={work.versionDiff.isLoading}
          isUpdating={false}
          onClose={work.versionDiff.close}
          onGoToItem={(editorIndex) => editorRef.current?.scrollToContent('', editorIndex)}
          labelInsert="Atual"
          labelDelete="Histórico"
        />
      ) : diff.showDiffSidebar && (
        <DiffSidebar
          items={diff.diffItems}
          fileName={diff.diffFileName}
          isLoading={diff.isDiffLoading}
          isUpdating={diff.isDiffUpdating}
          onClose={diff.closeDiffSidebar}
          onGoToItem={(editorIndex) => editorRef.current?.scrollToContent('', editorIndex)}
        />
      )}

      {work.showHistory && (
        <ErrorBoundary><Suspense fallback={<ModalLoadingFallback />}>
          <HistoryModal
            files={work.historyFiles}
            epubFiles={work.epubFiles}
            onClose={() => work.setShowHistory(false)}
            onLoad={work.loadHistoryFile}
            onDownloadEpub={work.downloadEpubFile}
            formatTimestamp={formatTimestamp}
          />
        </Suspense></ErrorBoundary>
      )}

      {showCompare && (
        <ErrorBoundary><Suspense fallback={<ModalLoadingFallback />}>
          <CompareModal
            files={work.historyFiles}
            formatTimestamp={formatTimestamp}
            onCompareFile={(file) => { work.versionDiff.close(); diff.handleCompareFile(file); }}
            onCompareHistory={(file) => { diff.closeDiffSidebar(); work.versionDiff.compareWithEditor(file, work.fullHtmlContent); }}
            onClose={() => setShowCompare(false)}
          />
        </Suspense></ErrorBoundary>
      )}

      {showShortcuts && (
        <ErrorBoundary><Suspense fallback={<ModalLoadingFallback />}>
          <ShortcutsModal onClose={() => setShowShortcuts(false)} />
        </Suspense></ErrorBoundary>
      )}

      {showStats && (
        <ErrorBoundary><Suspense fallback={<ModalLoadingFallback />}>
          <StatisticsModal stats={work.stats} onClose={() => setShowStats(false)} />
        </Suspense></ErrorBoundary>
      )}

      {sidebars.showValidationSidebar && (work.validationResults || work.footnoteValidation || work.linkValidation) && (
        <ValidationSidebar
          results={work.validationResults}
          footnoteResults={work.footnoteValidation}
          linkResults={work.linkValidation}
          onClose={() => { sidebars.setShowValidationSidebar(false); work.setValidationResults(null); work.setFootnoteValidation(null); work.setLinkValidation(null); }}
          onGoToIssue={handleGoToIssue}
          onFixLinks={handleFixLinks}
        />
      )}

      {sidebars.showImageGallerySidebar && (
        <ImageGallerySidebar
          isbn={isbn!}
          htmlContent={work.htmlContent}
          onClose={() => sidebars.setShowImageGallerySidebar(false)}
          editorRef={editorRef}
          onContentUpdate={work.setHtmlContent}
          refreshKey={galleryRefreshKey}
        />
      )}

      {work.previewBlob && (
        <ErrorBoundary><Suspense fallback={<ModalLoadingFallback />}>
          <EpubPreviewModal epubBlob={work.previewBlob} onClose={work.closePreview} title={work.title} />
        </Suspense></ErrorBoundary>
      )}

      {showStyleEditor && (
        <ErrorBoundary><Suspense fallback={<ModalLoadingFallback />}>
          <StyleEditorModal isbn={isbn!} onClose={() => setShowStyleEditor(false)} />
        </Suspense></ErrorBoundary>
      )}

      {showFonts && (
        <ErrorBoundary><Suspense fallback={<ModalLoadingFallback />}>
          <FontModal
            value={editorFont}
            onChange={(id) => { setEditorFont(id); storeFont(id); }}
            sizeValue={editorFontSize}
            onChangeSize={(id) => { setEditorFontSize(id); storeFontSize(id); }}
            onClose={() => setShowFonts(false)}
          />
        </Suspense></ErrorBoundary>
      )}

      {showConversions && (
        <ConversionsModal
          onApply={(options) => editorRef.current?.applyConversions(options)}
          onApplyDropCaps={work.handleApplyDropCaps}
          onClose={() => setShowConversions(false)}
        />
      )}

      {showToc && (
        <TocModal
          chapters={work.chapters}
          onReorderChapter={work.handleReorderChapter}
          onEditChapterTitle={work.handleEditChapterTitle}
          onClose={() => setShowToc(false)}
        />
      )}

      {epubMapping && (
        <EpubMappingModal
          fileName={epubMapping.file.name}
          classes={epubMapping.classes}
          onConfirm={(mapping) => {
            // Mapeamento já definido → nada mais a decidir (EPUB não tem conversões próprias,
            // ver isEpub em ImportOptionsModal); importa direto, sem mostrar esse modal a seguir.
            work.handleImportDocument(epubMapping.file, {
              indentAllParagraphs: false, topOnBoldParagraphs: false, noIndentAfterBold: false,
              wrapBoldWithNext: false, convertListsToDialogue: false, detectParagraphSpacing: false,
            }, undefined, mapping);
            setEpubMapping(null);
          }}
          onClose={() => setEpubMapping(null)}
        />
      )}

      {pendingImportFile && (
        <ImportOptionsModal
          file={pendingImportFile}
          fileName={pendingImportFile.name}
          onConfirm={handleImportConfirm}
          onClose={() => setPendingImportFile(null)}
        />
      )}

      {grammarChoiceOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setGrammarChoiceOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold text-slate-700">Revisão Gramatical</h3>
            <p className="text-sm text-text-muted">Existe uma revisão anterior. O que pretende fazer?</p>
            <div className="flex gap-3">
              <button
                className="flex-1 py-2 px-4 border border-border rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                onClick={() => { setGrammarChoiceOpen(false); sidebars.openPanel('grammar'); diff.closeDiffSidebar(); }}
              >
                Carregar anterior
              </button>
              <button
                className="flex-1 py-2 px-4 bg-slate-700 text-white rounded-xl text-sm font-bold hover:bg-slate-600 transition-colors"
                onClick={() => { setGrammarChoiceOpen(false); sidebars.openPanel('grammar'); diff.closeDiffSidebar(); editorRef.current?.triggerGrammarCheck(); }}
              >
                Nova revisão
              </button>
            </div>
          </div>
        </div>
      )}

      {work.presence.freed && !freedDismissed && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFreedDismissed(true)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-lg font-bold text-slate-700">Edição libertada</h3>
            <p className="text-sm text-text-muted">O outro utilizador saiu do projeto. Quer atualizar a página para passar a editar? As alterações dele serão carregadas.</p>
            <div className="flex gap-3">
              <button
                className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 h-9 rounded-lg font-bold text-xs transition-all shadow-sm active:scale-95"
                onClick={() => setFreedDismissed(true)}
              >
                Não
              </button>
              <button
                className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 h-9 rounded-lg font-bold text-xs transition-all shadow-sm active:scale-95"
                onClick={() => window.location.reload()}
              >
                Atualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
