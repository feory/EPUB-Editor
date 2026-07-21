import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Search, X, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ebooksApi } from '../api/ebooks-api';
import type { Ebook } from '../api/ebooks-api';
import { useNotification } from '../context/NotificationContext';
import { extractEpub, scanEpubClasses } from '../services/epub-importer';
import type { EpubClassInfo } from '../services/epub-importer';
import { cleanEditorHtml } from '../utils/html-cleaner';
import { compressHtml } from '../utils/compression';
import { MetadataModal } from './work/components/WorkModals';
import { CreateEbookModal } from './home/CreateEbookModal';
import { CoverModal } from './home/CoverModal';
import { TrashModal } from './home/TrashModal';
import { ShareModal } from './home/ShareModal';
import { InProgressTable } from './home/InProgressTable';
import { CompletedTable } from './home/CompletedTable';
import { EbookGrid } from './home/EbookGrid';
import { UserMenu } from './home/UserMenu';
import { EpubMappingModal } from './EpubMappingModal';

type ViewMode = 'table' | 'grid';

export function HomePage() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showNotification } = useNotification();
    const { user: currentUser, logout } = useAuth();

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showMetadataModal, setShowMetadataModal] = useState(false);
    const [selectedEbook, setSelectedEbook] = useState<Ebook | null>(null);
    const [showCoverModal, setShowCoverModal] = useState(false);
    const [coverUrl, setCoverUrl] = useState<string | null>(null);
    const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);
    const [trashOpen, setTrashOpen] = useState(false);
    const [sharingEbook, setSharingEbook] = useState<Ebook | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    // Clicar fora colapsa a pesquisa (só quando vazia — não destrói um filtro ativo)
    useEffect(() => {
        if (!searchOpen) return;
        const onDown = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node) && !searchQuery) {
                setSearchOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [searchOpen, searchQuery]);
    const [coverVersions, setCoverVersions] = useState<Record<string, number>>({});
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const saved = localStorage.getItem('epub-view-mode');
        return saved === 'grid' ? 'grid' : 'table';
    });
    const [activeTab, setActiveTab] = useState<'in_progress' | 'completed'>('in_progress');

    useEffect(() => {
        localStorage.setItem('epub-view-mode', viewMode);
    }, [viewMode]);

    useEffect(() => {
        if (!showCoverModal) {
            setCoverUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
            setCropImageUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
        }
    }, [showCoverModal]);

    const { data: ebooks = [], isLoading: loading } = useQuery({
        queryKey: ['ebooks'],
        queryFn: async () => (await ebooksApi.getAll()).data.data,
    });
    const { data: trashEbooks = [] } = useQuery({
        queryKey: ['trash'],
        queryFn: async () => (await ebooksApi.getTrash()).data.data,
    });

    const updateMetadataMutation = useMutation({
        mutationFn: ({ isbn, data }: { isbn: string; data: Partial<Ebook> }) => ebooksApi.updateMetadata(isbn, data),
        onSuccess: (_data, variables) => { queryClient.invalidateQueries({ queryKey: ['ebooks'] }); queryClient.invalidateQueries({ queryKey: ['ebook', variables.isbn] }); setShowMetadataModal(false); showNotification('success', 'Metadados atualizados!'); },
        onError: () => { showNotification('error', 'Erro ao atualizar metadados.'); },
    });
    const createEbookMutation = useMutation({
        mutationFn: (data: any) => ebooksApi.create(data),
        onSuccess: (_, variables) => { queryClient.invalidateQueries({ queryKey: ['ebooks'] }); setIsModalOpen(false); navigate(`/work/${variables.ebook_isbn}`); },
        onError: () => { showNotification('error', 'Erro ao criar ebook. Verifique se o ISBN já existe.'); },
    });

    // Importar EPUB → cria ebook Em Progresso + metadados do OPF + conteúdo/imagens, e abre o editor.
    const epubInputRef = useRef<HTMLInputElement>(null);
    const [scanningEpub, setScanningEpub] = useState(false);
    const [epubMapping, setEpubMapping] = useState<{ file: File; classes: EpubClassInfo[] } | null>(null);
    const importEpubMutation = useMutation({
        mutationFn: async ({ file, mapping }: { file: File; mapping?: Record<string, string> }): Promise<string> => {
            const { html, images, metadata } = await extractEpub(file, mapping);
            const isbn = metadata?.ebook_isbn || file.name.replace(/\.epub$/i, '');
            // O servidor exige title+author não-vazios; fallback quando o OPF não os traz.
            const title = metadata?.title || file.name.replace(/\.epub$/i, '');
            const author = metadata?.author || '—';
            await ebooksApi.create({ ebook_isbn: isbn, physical_isbn: '', title, author });
            let finalHtml = cleanEditorHtml(html);
            if (images.size > 0) {
                const fd = new FormData();
                for (const [id, blob] of images) fd.append('images', blob, `${id}.${blob.type.split('/')[1] || 'png'}`);
                await ebooksApi.uploadImages(isbn, fd);
                // src="placeholder" → URL do servidor. Independente da ordem dos atributos
                // (o src pode vir antes do data-image-id) e preserva os restantes atributos.
                finalHtml = finalHtml.replace(/<img\b[^>]*>/gi, (tag) => {
                    const m = tag.match(/data-image-id="([^"]+)"/);
                    return m ? tag.replace(/\bsrc="placeholder"/, `src="/api/ebooks/${isbn}/images/${m[1]}"`) : tag;
                });
            }
            await ebooksApi.saveContent(isbn, compressHtml(finalHtml));
            if (metadata) await ebooksApi.updateMetadata(isbn, {
                title, author, description: metadata.description,
                publisher: metadata.publisher, language: metadata.language, subjects: metadata.subjects,
                pub_date: metadata.pub_date, physical_isbn: '',
            });
            return isbn;
        },
        onSuccess: (isbn) => { queryClient.invalidateQueries({ queryKey: ['ebooks'] }); navigate(`/work/${isbn}`); },
        onError: (e: any) => { showNotification('error', e?.response?.status === 409 ? 'Já existe um ebook com este ISBN.' : 'Erro ao importar o EPUB.'); },
    });
    // EPUB antigo → abre modal de mapeamento de classes; EPUB da app → importa direto.
    const handleImportEpub = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setScanningEpub(true);
        try {
            const { legacy, classes } = await scanEpubClasses(file);
            if (legacy && classes.length) setEpubMapping({ file, classes });
            else importEpubMutation.mutate({ file });
        } catch {
            importEpubMutation.mutate({ file }); // scan falhou → best-effort direto
        } finally {
            setScanningEpub(false);
        }
    };
    const updateStatusMutation = useMutation({
        mutationFn: ({ isbn, status }: { isbn: string; status: Ebook['status']; title: string }) => ebooksApi.updateStatus(isbn, status),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['ebooks'] });
            queryClient.invalidateQueries({ queryKey: ['ebook', variables.isbn] });
            if (variables.status === 'completed') showNotification('success', `Ebook ${variables.title} concluído!`, 3000);
            else showNotification('success', `Ebook ${variables.title} reaberto.`, 3000);
        },
    });
    const uploadCoverMutation = useMutation({
        mutationFn: ({ isbn, data }: { isbn: string; data: FormData }) => ebooksApi.uploadCover(isbn, data),
        onSuccess: (_, variables) => {
            setCoverVersions(prev => ({ ...prev, [variables.isbn]: Date.now() }));
            queryClient.invalidateQueries({ queryKey: ['ebooks'] });
            showNotification('success', 'Capa atualizada!');
        },
        onError: () => { showNotification('error', 'Erro ao carregar capa.'); },
    });
    const deleteEbookMutation = useMutation({
        mutationFn: (vars: { isbn: string; title: string }) => ebooksApi.deleteEbook(vars.isbn),
        onSuccess: (_data, vars) => { queryClient.invalidateQueries({ queryKey: ['ebooks'] }); queryClient.invalidateQueries({ queryKey: ['trash'] }); showNotification('success', `Ebook ${vars.title} movido para a reciclagem.`, 3000); },
        onError: () => { showNotification('error', 'Erro ao eliminar o registo.'); },
    });
    const restoreEbookMutation = useMutation({
        mutationFn: (vars: { isbn: string; title: string }) => ebooksApi.restoreEbook(vars.isbn),
        onSuccess: (_data, vars) => { queryClient.invalidateQueries({ queryKey: ['ebooks'] }); queryClient.invalidateQueries({ queryKey: ['trash'] }); showNotification('success', `Ebook ${vars.title} restaurado.`, 3000); },
        onError: () => { showNotification('error', 'Erro ao restaurar o registo.'); },
    });
    const permanentDeleteMutation = useMutation({
        mutationFn: (isbn: string) => ebooksApi.permanentDelete(isbn),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trash'] }); showNotification('success', 'Ebook eliminado.', 3000); },
        onError: () => { showNotification('error', 'Erro ao eliminar permanentemente.'); },
    });
    const permanentDeleteAllMutation = useMutation({
        mutationFn: (isbns: string[]) => Promise.all(isbns.map((isbn) => ebooksApi.permanentDelete(isbn))),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trash'] }); showNotification('success', 'Reciclagem esvaziada.', 3000); },
        onError: () => { showNotification('error', 'Erro ao esvaziar a reciclagem.'); },
    });
    const cleanupMutation = useMutation({
        mutationFn: () => ebooksApi.cleanupHistory(),
        onSuccess: (res) => { showNotification('success', `Limpeza concluída! Removidos ${res.data.deletedCount} ficheiros (${res.data.sizeSavedMB} MB).`); },
        onError: () => { showNotification('error', 'Erro ao realizar a limpeza do histórico.'); },
    });

    const toggleStatus = (e: React.MouseEvent, ebook: Ebook) => {
        e.stopPropagation();
        const newStatus = ebook.status === 'in_progress' ? 'completed' : 'in_progress';
        updateStatusMutation.mutate({ isbn: ebook.ebook_isbn, status: newStatus, title: ebook.title });
    };

    const openShareModal = (e: React.MouseEvent, ebook: Ebook) => {
        e.stopPropagation();
        setSharingEbook(ebook);
    };

    const openCoverModal = async (e: React.MouseEvent, ebook: Ebook) => {
        e.stopPropagation();
        setSelectedEbook(ebook);
        setCoverUrl(null);
        setShowCoverModal(true);
        try {
            const res = await ebooksApi.getCover(ebook.ebook_isbn);
            setCoverUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(res.data); });
        } catch { /* no cover */ }
    };

    const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedEbook) return;
        event.target.value = '';
        if (file.type === 'application/pdf') {
            try {
                const pdfjsLib = await import('pdfjs-dist');
                pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
                const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                await page.render({ canvas, canvasContext: ctx, viewport }).promise;
                canvas.toBlob((blob) => { if (blob) setCropImageUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); }); }, 'image/jpeg', 0.95);
            } catch (error) { console.error('Error rendering PDF:', error); showNotification('error', 'Erro ao processar o PDF.'); }
        } else {
            setCropImageUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
        }
    };

    const handleCropSave = (croppedBlob: Blob) => {
        if (!selectedEbook) return;
        setCoverUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(croppedBlob); });
        setCropImageUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
        const fd = new FormData();
        fd.append('cover', croppedBlob, 'cover.jpg');
        uploadCoverMutation.mutate({ isbn: selectedEbook.ebook_isbn, data: fd });
    };

    const handleDownloadEpub = async (isbn: string) => {
        try {
            const res = await ebooksApi.getEpub(isbn);
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${isbn}.epub`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            showNotification('error', 'Sem EPUB disponível para descarregar.');
        }
    };

    const generateAutoCover = async () => {
        if (!selectedEbook) return;
        const canvas = document.createElement('canvas');
        canvas.width = 600; canvas.height = 800;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#475569'; ctx.fillRect(0, 0, 600, 800);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2;
        for (let i = 0; i < 800; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(600, i + 200); ctx.stroke(); }
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = 'bold 48px Inter, sans-serif';
        const words = selectedEbook.title.split(' ');
        let line = '', y = 300;
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > 500 && n > 0) { ctx.fillText(line, 300, y); line = words[n] + ' '; y += 60; } else { line = testLine; }
        }
        ctx.fillText(line, 300, y); ctx.font = 'italic 32px Inter, sans-serif'; ctx.fillText(selectedEbook.author, 300, y + 100);
        canvas.toBlob(async (blob) => {
            if (!blob) return;
            setCoverUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
            const fd = new FormData(); fd.append('cover', blob, 'cover.jpg');
            uploadCoverMutation.mutate({ isbn: selectedEbook.ebook_isbn, data: fd });
        }, 'image/jpeg');
    };

    const filteredEbooks = searchQuery.trim()
        ? ebooks.filter(e => {
            const q = searchQuery.toLowerCase();
            return e.ebook_isbn.toLowerCase().includes(q) || e.title.toLowerCase().includes(q) || e.author.toLowerCase().includes(q);
          })
        : ebooks;

    const inProgressEbooks = filteredEbooks.filter(e => e.status !== 'completed');
    const completedEbooks = filteredEbooks.filter(e => e.status === 'completed');

    const searchControl = searchOpen ? (
        <div ref={searchRef} className="relative w-full animate-in fade-in slide-in-from-right-2 duration-200">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="text" autoFocus placeholder="ISBN, título ou autor..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setSearchQuery(''); setSearchOpen(false); } }}
                className="w-full pl-9 pr-8 h-9 rounded-lg border border-border bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all normal-case font-normal"
            />
            <button onClick={() => { setSearchQuery(''); setSearchOpen(false); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={14} />
            </button>
        </div>
    ) : (
        <button onClick={() => setSearchOpen(true)} className="inline-flex items-center justify-center w-9 h-9 rounded-lg hover:bg-slate-200 text-text-muted transition-all" title="Pesquisar">
            <Search size={16} />
        </button>
    );

    return (
        <div className="flex flex-col min-h-screen bg-bg-color">
            <nav className="sticky top-0 z-50 bg-surface border-b border-border px-6 py-3 shadow-sm">
                <div className="max-w-7xl mx-auto flex justify-between items-center gap-6">
                    <div className="flex items-center gap-2 font-bold text-xl text-slate-700 cursor-pointer select-none min-w-[200px]" onClick={() => navigate('/')}>
                        <span>Epub Manager</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="file" accept=".epub" hidden ref={epubInputRef} onChange={handleImportEpub} />
                        <button
                            disabled={importEpubMutation.isPending || scanningEpub}
                            className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 h-10 rounded-lg font-semibold text-sm transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={() => epubInputRef.current?.click()}
                            title="Importar EPUB (cria ebook + metadados)"
                        >
                            {importEpubMutation.isPending || scanningEpub ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Upload className="w-4.5 h-4.5" />}
                            <span>{importEpubMutation.isPending || scanningEpub ? 'A importar…' : 'Importação'}</span>
                        </button>

                        <button className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 h-10 rounded-lg font-semibold text-sm transition-all shadow-sm" onClick={() => setIsModalOpen(true)}>
                            <Plus className="w-4.5 h-4.5" />
                            <span>Novo Ebook</span>
                        </button>

                        {currentUser && (
                            <UserMenu
                                user={currentUser}
                                viewMode={viewMode}
                                onViewModeChange={setViewMode}
                                onLogout={handleLogout}
                                onCleanupHistory={() => cleanupMutation.mutate()}
                                cleanupPending={cleanupMutation.isPending}
                                onNavigateAdmin={() => navigate('/admin')}
                            />
                        )}
                    </div>
                </div>
            </nav>

            <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 flex flex-col">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4 text-text-muted">
                        <Loader2 className="animate-spin" size={40} />
                        <p className="font-medium">A carregar os teus ebooks...</p>
                    </div>
                ) : ebooks.length === 0 && trashEbooks.length === 0 ? (
                    <div className="flex-1 bg-surface rounded-2xl shadow-md border border-border overflow-hidden flex">
                        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6 text-center">
                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold text-slate-600">Ainda não tens ebooks</h3>
                                <p className="text-text-muted max-w-md mx-auto">Cria o teu primeiro ebook para começares a converter PDFs de forma simples e rápida.</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="flex items-center gap-2 border-b border-border">
                            <button
                                onClick={() => setActiveTab('in_progress')}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab === 'in_progress' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}
                            >
                                Em Progresso
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === 'in_progress' ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-text-muted'}`}>{inProgressEbooks.length}</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('completed')}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab === 'completed' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text-main'}`}
                            >
                                Concluído
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-text-muted'}`}>{completedEbooks.length}</span>
                            </button>
                        </div>

                        {activeTab === 'in_progress' && (
                            <div className="flex-1 flex flex-col bg-surface rounded-xl shadow-sm border border-border overflow-visible">
                                {viewMode === 'table' && (
                                    <InProgressTable
                                        searchSlot={searchControl}
                                        ebooks={inProgressEbooks}
                                        onNavigate={(isbn) => navigate(`/work/${isbn}`)}
                                        onOpenMetadata={(e, ebook) => { setSelectedEbook(ebook); setShowMetadataModal(true); }}
                                        onOpenCover={openCoverModal}
                                        onComplete={toggleStatus}
                                        onShare={openShareModal}
                                        onDelete={(isbn) => deleteEbookMutation.mutate({ isbn, title: inProgressEbooks.find(e => e.ebook_isbn === isbn)?.title || '' })}
                                        isDeleting={deleteEbookMutation.isPending}
                                        coverVersions={coverVersions}
                                        onDownloadEpub={handleDownloadEpub}
                                    />
                                )}
                                {viewMode === 'grid' && (
                                    <EbookGrid
                                        ebooks={inProgressEbooks}
                                        onNavigate={(isbn) => navigate(`/work/${isbn}`)}
                                        onOpenMetadata={(e, ebook) => { setSelectedEbook(ebook); setShowMetadataModal(true); }}
                                        onOpenCover={openCoverModal}
                                        onComplete={toggleStatus}
                                        onShare={openShareModal}
                                        onDelete={(isbn) => deleteEbookMutation.mutate({ isbn, title: inProgressEbooks.find(e => e.ebook_isbn === isbn)?.title || '' })}
                                        isDeleting={deleteEbookMutation.isPending}
                                        coverVersions={coverVersions}
                                        onDownloadEpub={handleDownloadEpub}
                                        emptyMessage="Não há ebooks em progresso no momento."
                                    />
                                )}
                            </div>
                        )}

                        {activeTab === 'completed' && (
                            <div className="flex-1 flex flex-col bg-surface rounded-xl shadow-sm border border-border overflow-visible">
                                {viewMode === 'table' && (
                                    <CompletedTable
                                        searchSlot={searchControl}
                                        ebooks={completedEbooks}
                                        onReopen={toggleStatus}
                                        coverVersions={coverVersions}
                                        onDownloadEpub={handleDownloadEpub}
                                    />
                                )}
                                {viewMode === 'grid' && (
                                    <EbookGrid
                                        ebooks={completedEbooks}
                                        onReopen={toggleStatus}
                                        coverVersions={coverVersions}
                                        onDownloadEpub={handleDownloadEpub}
                                        emptyMessage="Não há ebooks concluídos ainda."
                                    />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>

            <button
                className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-white hover:bg-slate-50 border border-border text-text-muted hover:text-rose-600 px-3 h-11 rounded-full shadow-lg transition-all"
                onClick={() => setTrashOpen(true)} title="Reciclagem"
            >
                <Trash2 size={16} />
                {trashEbooks.length > 0 && (
                    <span className="bg-rose-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{trashEbooks.length}</span>
                )}
            </button>

            <TrashModal
                isOpen={trashOpen}
                onClose={() => setTrashOpen(false)}
                trashEbooks={trashEbooks}
                onRestore={(isbn) => restoreEbookMutation.mutate({ isbn, title: trashEbooks.find(e => e.ebook_isbn === isbn)?.title || '' })}
                onPermanentDelete={(isbn) => permanentDeleteMutation.mutate(isbn)}
                onPermanentDeleteAll={(isbns) => permanentDeleteAllMutation.mutate(isbns)}
                isRestoring={restoreEbookMutation.isPending}
                isDeleting={permanentDeleteMutation.isPending}
                isDeletingAll={permanentDeleteAllMutation.isPending}
            />

            {sharingEbook && (
                <ShareModal ebook={sharingEbook} onClose={() => setSharingEbook(null)} />
            )}

            {showCoverModal && selectedEbook && (
                <CoverModal
                    isOpen={showCoverModal}
                    onClose={() => setShowCoverModal(false)}
                    ebook={selectedEbook}
                    coverUrl={coverUrl}
                    cropImageUrl={cropImageUrl}
                    onFileUpload={handleCoverUpload}
                    onCropSave={handleCropSave}
                    onCropCancel={() => setCropImageUrl(null)}
                    onGenerateAutoCover={generateAutoCover}
                />
            )}

            <CreateEbookModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={(data) => createEbookMutation.mutate(data)}
                isSubmitting={createEbookMutation.isPending}
            />

            {showMetadataModal && selectedEbook && (
                <MetadataModal
                    ebook={selectedEbook}
                    onClose={() => setShowMetadataModal(false)}
                    onSave={(data) => updateMetadataMutation.mutate({ isbn: selectedEbook.ebook_isbn, data })}
                />
            )}

            {epubMapping && (
                <EpubMappingModal
                    fileName={epubMapping.file.name}
                    classes={epubMapping.classes}
                    onClose={() => setEpubMapping(null)}
                    onConfirm={(mapping) => { importEpubMutation.mutate({ file: epubMapping.file, mapping }); setEpubMapping(null); }}
                />
            )}
        </div>
    );
}
