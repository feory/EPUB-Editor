import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, ChevronLeft, ChevronRight, List } from 'lucide-react';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';

interface EpubPreviewModalProps {
  epubBlob: Blob | null;
  onClose: () => void;
  title: string;
}

interface TocItem {
  href: string;
  label: string;
  subitems?: TocItem[];
  level: number;
}

const EpubPreviewModalComponent: React.FC<EpubPreviewModalProps> = ({ epubBlob, onClose, title }) => {
  useBodyScrollLock();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [useFallback] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadingRef = useRef(loading);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    if (!epubBlob) return;

    // Timer para mostrar o botão de fallback se demorar muito
    const timer = setTimeout(() => {
        if (loadingRef.current) setShowFallback(true);
    }, 8000);

    const epubUrl = URL.createObjectURL(epubBlob);
    const iframe = iframeRef.current;
    if (!iframe) return;

    const readerHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js"></script>
        <style>
          body { margin: 0; padding: 0; background: #fff; font-family: sans-serif; overflow: hidden; }
          #viewer { width: 100vw; height: 100vh; background: white; }
        </style>
      </head>
      <body>
        <div id="viewer"></div>
        <script>
          function log(m) { console.log("[Reader]", m); }
          function reportError(msg) {
            console.error("[Reader Error]", msg);
            window.parent.postMessage({type: "error", message: msg}, "*");
          }

          window.onerror = (m) => reportError("JS Error: " + m);

          async function init() {
            try {
              log("A descarregar binário...");
              const resp = await fetch("${epubUrl}");
              const buffer = await resp.arrayBuffer();
              log("Binário carregado (" + buffer.byteLength + " bytes). Inicializando motor...");
              
              const book = ePub(buffer);
              const viewer = document.getElementById("viewer");
              
              const rendition = book.renderTo("viewer", {
                width: "100%",
                height: "100%",
                flow: "paginated",
                manager: "default"
              });

              log("A chamar display()...");
              rendition.display().then(() => {
                log("Rendition display resolvido.");
              }).catch(err => {
                log("Erro no display inicial, a tentar fallback...");
                rendition.display(0);
              });

              window.addEventListener("message", (e) => {
                log("Comando recebido: " + e.data.type + (e.data.href ? " -> " + e.data.href : ""));
                if (e.data.type === "next") rendition.next();
                if (e.data.type === "prev") rendition.prev();
                if (e.data.type === "goto") {
                    // Tenta navegar diretamente. Se falhar, tenta remover prefixos comuns
                    rendition.display(e.data.href).catch(err => {
                        log("Erro ao navegar: " + err.message);
                        const cleanHref = e.data.href.replace(/^OEBPS\\//, "");
                        rendition.display(cleanHref);
                    });
                }
              });

              // Intercetar cliques para evitar navegação do browser
              rendition.on("click", (e) => {
                const target = e.target;
                if (target.tagName === "A") {
                  e.preventDefault();
                  const href = target.getAttribute("href");
                  if (href && !href.startsWith("http")) {
                    rendition.display(href);
                  }
                }
              });

              // Impedir que o epub.js altere o URL/histórico do pai
              book.settings.history = false;

              await book.ready;
              log("Livro pronto (book.ready).");
              
              const nav = book.navigation;
              const toc = (nav && nav.toc) ? nav.toc : [];
              
              window.parent.postMessage({type: "ready"}, "*");
              window.parent.postMessage({type: "toc_data", data: toc}, "*");
              
            } catch(e) {
              reportError("Falha na inicialização: " + e.message);
            }
          }
          
          init();
        </script>
      </body>
      </html>
    `;

    iframe.srcdoc = readerHtml;

    const handleMessage = (e: MessageEvent) => {
      // Only accept messages from our own preview iframe.
      if (e.source !== iframeRef.current?.contentWindow || !e.data) return;
      if (e.data.type === 'ready') {
          setLoading(false);
          setError(null);
          clearTimeout(timer);
      }
      if (e.data.type === 'toc_data') {
          // Função recursiva para achatar o índice (TOC) com nível de profundidade
          const flattenToc = (items: TocItem[], level = 0): TocItem[] => {
              return items.reduce<TocItem[]>((acc, item) => {
                  acc.push({ ...item, level });
                  if (item.subitems && item.subitems.length > 0) {
                      acc.push(...flattenToc(item.subitems, level + 1));
                  }
                  return acc;
              }, []);
          };
          setToc(flattenToc(e.data.data));
      }
      if (e.data.type === 'error') {
          setError(e.data.message);
          setLoading(false);
          clearTimeout(timer);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      URL.revokeObjectURL(epubUrl);
      window.removeEventListener('message', handleMessage);
      clearTimeout(timer);
    };
  }, [epubBlob]);

  const sendCommand = (type: string, payload?: { href?: string }) => {
    iframeRef.current?.contentWindow?.postMessage({ type, ...payload }, '*');
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative bg-surface w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-white z-10">
          <div className="flex items-center gap-4">
            <button 
                onClick={() => setShowToc(!showToc)}
                disabled={!!error || loading || useFallback}
                className={`p-2 rounded-lg transition-colors ${showToc ? 'bg-primary text-white' : 'hover:bg-slate-100 text-text-muted disabled:opacity-30'}`}
                title="Índice"
            >
                <List size={20} />
            </button>
            <div>
              <h2 className="text-sm font-bold text-slate-700 leading-tight truncate max-w-[300px]">{title}</h2>
            </div>
          </div>

          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 relative flex overflow-hidden">
          {/* Sidebar de Índice */}
          {showToc && !useFallback && (
            <aside className="bg-white border-r border-border w-72 transition-all duration-300 overflow-y-auto">
                <div className="p-4 space-y-1">
                    <h3 className="text-xs font-black text-text-muted uppercase tracking-widest mb-4 px-2">Índice</h3>
                    {toc.map((item, i) => (
                        <button
                            key={i}
                            onClick={() => {
                                console.log("Navigating to:", item.href);
                                sendCommand('goto', { href: item.href });
                            }}
                            className={`w-full text-left p-2.5 text-xs font-medium hover:bg-slate-200 hover:text-slate-900 rounded-lg transition-all ${
                                item.level > 0 ? 'ml-4 border-l border-slate-100 text-text-muted' : 'font-bold text-text-main'
                            }`}
                            style={{ paddingLeft: `${item.level * 12 + 10}px` }}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </aside>
          )}

          {/* Container do Leitor */}
          <div className="flex-1 relative bg-slate-200/20">
            {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted gap-3 bg-white z-20">
                    <Loader2 className="animate-spin text-primary" size={32} />
                    <span className="text-sm font-medium">A preparar e-reader...</span>
                    
                    {showFallback && (
                        <div className="mt-8 p-6 bg-amber-50 border border-amber-100 rounded-2xl max-w-sm text-center animate-in fade-in slide-in-from-bottom-4">
                            <p className="text-xs text-amber-800 mb-4">O leitor está a demorar mais do que o habitual. Pode haver um problema de compatibilidade.</p>
                            <button 
                                onClick={() => {
                                    setError("Tempo de espera excedido. Tente exportar o EPUB e abrir num leitor externo.");
                                }}
                                className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm"
                            >
                                Cancelar e Ver Erro
                            </button>
                        </div>
                    )}
                </div>
            )}
            
            {error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-rose-600 gap-4 bg-white z-20 p-8 text-center">
                    <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center">
                        <X size={32} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">Não foi possível carregar o preview</h3>
                        <p className="text-sm opacity-80 mt-1 max-w-md mx-auto font-mono text-left bg-slate-50 p-4 rounded-lg border border-slate-100">{error}</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-colors">Voltar ao Editor</button>
                    </div>
                </div>
            ) : (
                <iframe 
                    ref={iframeRef}
                    className="w-full h-full border-none"
                    title="EPUB Engine"
                />
            )}
          </div>
        </div>
        
        <div className="px-6 py-3 bg-white border-t border-border flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-3">
                <span className="text-[9px] text-text-muted uppercase font-black tracking-tighter bg-slate-100 px-2 py-1 rounded">EPUB.js Engine</span>
                <span className="text-[9px] text-text-muted font-medium font-mono hidden sm:inline">Status: {loading ? 'Loading...' : 'Ready'}</span>
            </div>

            {/* Navegação Inferior */}
            {!error && !loading && !useFallback && (
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => sendCommand('prev')}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-all active:scale-95 border border-transparent hover:border-slate-200"
                    >
                        <ChevronLeft size={18} />
                        Anterior
                    </button>
                    
                    <div className="h-6 w-px bg-slate-200"></div>
                    
                    <button 
                        onClick={() => sendCommand('next')}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-all active:scale-95 border border-transparent hover:border-slate-200"
                    >
                        Próximo
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}

            <div className="text-[9px] text-text-muted font-medium hidden md:block italic">
                Dica: Podes usar as setas do teclado
            </div>
        </div>
      </div>
    </div>
  );
};

// Memoized export for performance optimization
export const EpubPreviewModal = React.memo(EpubPreviewModalComponent);