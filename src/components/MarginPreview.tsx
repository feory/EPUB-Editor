import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Check, X, ChevronLeft, ChevronRight, Loader2, Settings, Image as ImageIcon } from 'lucide-react';

export interface ImageSettings {
  compress: boolean;
  quality: number;
  maxWidth: number;
}

interface MarginPreviewProps {
  file: File;
  onConfirm: (headerMargin: number, footerMargin: number, imageSettings: ImageSettings) => void;
  onCancel: () => void;
}

export const MarginPreview = ({ file, onConfirm, onCancel }: MarginPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageHeight, setPageHeight] = useState(0);
  const [headerY, setHeaderY] = useState(0);
  const [footerY, setFooterY] = useState(0);
  const [isDraggingHeader, setIsDraggingHeader] = useState(false);
  const [isDraggingFooter, setIsDraggingFooter] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Image Settings State
  const [imageSettings, setImageSettings] = useState<ImageSettings>({
    compress: true,
    quality: 0.8,
    maxWidth: 1200
  });

  useEffect(() => {
    let renderTask: any = null;
    let isMounted = true;
    let pdf: any = null;

    const renderPage = async () => {
      if (!canvasRef.current || !isMounted) return;

      setIsLoading(true);

      try {
        const arrayBuffer = await file.arrayBuffer();
        pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (!isMounted) return;

        if (totalPages === 1 && pdf.numPages > 1) {
          setTotalPages(pdf.numPages);
        }

        const page = await pdf.getPage(currentPage);

        if (!isMounted) return;

        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (!context || !isMounted) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        setPageHeight(viewport.height);
        setHeaderY(viewport.height * 0.1); 
        setFooterY(viewport.height * 0.9); 

        renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
          canvas: canvas
        });

        await renderTask.promise;

        if (isMounted) {
          setIsLoading(false);
        }
      } catch (error: any) {
        if (error?.name !== 'RenderingCancelledException' && isMounted) {
          console.error('Error rendering PDF preview:', error);
        }
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      if (renderTask) {
        try { renderTask.cancel(); } catch { }
      }
      if (pdf) {
        try { pdf.cleanup(); } catch { }
      }
    };
  }, [file, currentPage, totalPages]);

  const handleMouseDown = (isHeader: boolean) => {
    if (isHeader) { setIsDraggingHeader(true); } 
    else { setIsDraggingFooter(true); }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;

    if (isDraggingHeader) {
      const newY = Math.max(0, Math.min(y, footerY - 20));
      setHeaderY(newY);
    } else if (isDraggingFooter) {
      const newY = Math.max(headerY + 20, Math.min(y, pageHeight));
      setFooterY(newY);
    }
  };

  const handleMouseUp = () => {
    setIsDraggingHeader(false);
    setIsDraggingFooter(false);
  };

  const headerPercentage = (headerY / pageHeight * 100).toFixed(1);
  const footerPercentage = (footerY / pageHeight * 100).toFixed(1);
  const footerMarginPercentage = (100 - parseFloat(footerPercentage)).toFixed(1);

  const handleConfirm = () => {
    onConfirm(parseFloat(headerPercentage), parseFloat(footerMarginPercentage), imageSettings);
  };

  return (
    <div className="bg-surface rounded-2xl shadow-xl border border-border overflow-hidden animate-in fade-in duration-500">
      <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center text-white">
            <Settings size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-700">Configurações de Importação</h3>
            <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Ajuste as margens e a qualidade das imagens</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-text-muted hover:bg-slate-200 transition-colors">
            <X size={18} />
            <span>Cancelar</span>
          </button>
          <button onClick={handleConfirm} disabled={isLoading} className="inline-flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-bold bg-primary hover:bg-primary-hover text-white shadow-md active:scale-95 disabled:opacity-50 transition-all">
            <Check size={18} />
            <span>Confirmar Configurações</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-0 h-[700px]">
        {/* Sidebar Controls */}
        <div className="border-r border-border bg-slate-50/30 p-6 flex flex-col gap-6 overflow-y-auto">
          {/* Section: Margins */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Margens de Corte</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-xl border border-border shadow-sm">
                <div className="text-[10px] font-bold text-rose-500 uppercase">Superior</div>
                <div className="text-xl font-black text-text-main">{headerPercentage}%</div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-border shadow-sm">
                <div className="text-[10px] font-bold text-rose-500 uppercase">Inferior</div>
                <div className="text-xl font-black text-text-main">{footerMarginPercentage}%</div>
              </div>
            </div>
          </div>

          {/* Section: Image Compression */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="text-xs font-bold text-text-muted uppercase tracking-widest px-1 flex items-center gap-2">
              <ImageIcon size={14} />
              Imagens
            </div>
            
            <div className="bg-white p-4 rounded-xl border border-border shadow-sm space-y-4">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-bold text-text-main">Comprimir Imagens</span>
                <input 
                  type="checkbox" 
                  className="w-5 h-5 accent-primary" 
                  checked={imageSettings.compress}
                  onChange={(e) => setImageSettings({...imageSettings, compress: e.target.checked})}
                />
              </label>

              {imageSettings.compress && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase">
                      <span className="text-text-muted">Qualidade (JPEG)</span>
                      <span className="text-primary">{Math.round(imageSettings.quality * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.1" max="1.0" step="0.1" 
                      className="w-full accent-primary"
                      value={imageSettings.quality}
                      onChange={(e) => setImageSettings({...imageSettings, quality: parseFloat(e.target.value)})}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase">
                      <span className="text-text-muted">Largura Máxima</span>
                      <span className="text-primary">{imageSettings.maxWidth}px</span>
                    </div>
                    <select 
                      className="w-full p-2 bg-slate-50 border border-border rounded-lg text-xs font-bold"
                      value={imageSettings.maxWidth}
                      onChange={(e) => setImageSettings({...imageSettings, maxWidth: parseInt(e.target.value)})}
                    >
                      <option value="800">800px (Leve)</option>
                      <option value="1200">1200px (Padrão)</option>
                      <option value="1600">1600px (HD)</option>
                      <option value="2400">Original (Pesado)</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-200">
            <div className="text-xs font-bold text-text-muted uppercase tracking-widest px-1">Navegação</div>
            <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-border shadow-sm">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors">
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-2">
                <input type="number" min="1" max={totalPages} value={currentPage} onChange={(e) => { const page = parseInt(e.target.value); if (page >= 1 && page <= totalPages) setCurrentPage(page); }} className="w-12 h-10 border border-border rounded-lg text-center font-bold text-text-main focus:border-primary outline-none" disabled={isLoading} />
                <span className="text-xs font-bold text-text-muted italic">de {totalPages}</span>
              </div>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || isLoading} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="relative bg-slate-200 p-8 flex justify-center items-start overflow-auto">
          <div ref={containerRef} className="relative bg-white shadow-2xl origin-top" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            {isLoading && (
              <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                <Loader2 className="animate-spin text-primary" size={48} />
                <span className="text-sm font-bold text-text-main uppercase tracking-widest">A processar PDF...</span>
              </div>
            )}
            <canvas ref={canvasRef} className="block" />
            {!isLoading && (
              <>
                <div className={`absolute left-0 right-0 h-1 bg-rose-500 cursor-ns-resize z-40 group transition-all ${isDraggingHeader ? 'bg-rose-600' : 'hover:h-1.5'}`} style={{ top: `${headerY}px` }} onMouseDown={() => handleMouseDown(true)}>
                  <div className="absolute -top-3 right-4 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase pointer-events-none group-hover:scale-110 transition-transform">Topo ({headerPercentage}%)</div>
                </div>
                <div className={`absolute left-0 right-0 h-1 bg-rose-500 cursor-ns-resize z-40 group transition-all ${isDraggingFooter ? 'bg-rose-600' : 'hover:h-1.5'}`} style={{ top: `${footerY}px` }} onMouseDown={() => handleMouseDown(false)}>
                  <div className="absolute -bottom-3 right-4 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase pointer-events-none group-hover:scale-110 transition-transform">Base ({footerMarginPercentage}%)</div>
                </div>
                <div className="absolute top-0 left-0 right-0 bg-slate-900/40 pointer-events-none border-b border-rose-400" style={{ height: `${headerY}px` }} />
                <div className="absolute bottom-0 left-0 right-0 bg-slate-900/40 pointer-events-none border-t border-rose-400" style={{ top: `${footerY}px`, height: `${pageHeight - footerY}px` }} />
                <div className="absolute left-0 right-0 border-x-2 border-emerald-400/30 pointer-events-none" style={{ top: `${headerY}px`, height: `${footerY - headerY}px` }}>
                   <div className="absolute inset-0 bg-emerald-400/5" />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};