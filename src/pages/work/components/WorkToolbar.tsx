import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileUp, Save, History, Download, Loader2, Eye, AlertTriangle, Keyboard, Hash, ChevronDown, ChevronRight, Palette, Shield, Accessibility, GitCompare, ListX, Wand2, Link2, Wrench, Type, ListTree
} from 'lucide-react';

interface WorkToolbarProps {
  isLoading: boolean;
  htmlContent: string;
  lastSaved: Date | null;
  onSave: () => void;
  onFetchHistory: () => void;
  onValidate: () => void;
  onValidateEpub: () => void;
  onValidateAccessibility: () => void;
  onValidateLinks: () => void;
  onPreview: () => void;
  onExport: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onToggleGrammar: () => void;
  onToggleImageGallery: () => void;
  onOpenCompare: () => void;
  onShowShortcuts: () => void;
  onShowStats: () => void;
  onShowStyleEditor: () => void;
  onShowFonts: () => void;
  onCleanIndex: () => void;
  onFixLinks: () => void;
  onConversions: () => void;
  onEditToc: () => void;
  readOnly?: boolean;
}

const WorkToolbarComponent: React.FC<WorkToolbarProps> = ({
  isLoading, htmlContent, lastSaved,
  onSave, onFetchHistory, onValidate, onValidateEpub, onValidateAccessibility, onValidateLinks, onPreview, onExport, onFileSelect, onToggleGrammar, onToggleImageGallery, onOpenCompare, onShowShortcuts, onShowStats, onShowStyleEditor, onShowFonts, onCleanIndex, onFixLinks, onConversions, onEditToc,
  readOnly
}) => {
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState<'tools' | 'export' | 'validation' | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const validationMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeMenu) return;
    const refMap = { tools: toolsMenuRef, export: exportMenuRef, validation: validationMenuRef };
    const activeRef = refMap[activeMenu];
    const handleClickOutside = (event: MouseEvent) => {
      if (activeRef.current && !activeRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    // Clicks inside the TinyMCE editor live in its iframe → don't reach `document`.
    // Listen on the iframe's own document so selecting a paragraph also closes the menu.
    const closeMenu = () => setActiveMenu(null);
    const iframeDoc = document.querySelector<HTMLIFrameElement>('.tox-edit-area__iframe')?.contentDocument;
    document.addEventListener('mousedown', handleClickOutside);
    iframeDoc?.addEventListener('mousedown', closeMenu);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      iframeDoc?.removeEventListener('mousedown', closeMenu);
    };
  }, [activeMenu]);

  return (
    <nav className="sticky top-0 z-50 bg-surface border-b border-border px-6 py-2.5 shadow-sm">
      <div className="max-w-[1600px] mx-auto flex justify-between items-center gap-4">
        
        {/* Left: Logo & Back */}
        <div
          className="flex items-center justify-end font-bold text-primary cursor-pointer select-none min-w-[60px] hover:text-primary-hover transition-colors"
          onClick={() => navigate('/')}
        >
          <ArrowLeft size={18} />
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Center: Action Groups */}
        <div className="flex items-center gap-2">

          {/* Group 1: Save */}
          <button
            onClick={() => onSave()}
            disabled={isLoading || !htmlContent || readOnly}
            title={readOnly ? 'Modo leitura — outro utilizador está a editar' : undefined}
            className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 min-w-[112px] px-4 h-9 rounded-lg font-bold text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Save size={14} />
            <span>
              {lastSaved ? lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Guardar'}
            </span>
          </button>

          {/* Group 2: Galeria */}
          <button
            onClick={onToggleImageGallery}
            disabled={readOnly}
            className="inline-flex items-center justify-center gap-2 min-w-[112px] px-4 h-9 rounded-lg font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={readOnly ? 'Modo leitura — outro utilizador está a editar' : 'Galeria de Imagens'}
          >
            <span className="hidden lg:inline">Galeria</span>
          </button>

          {/* Group 3: Tools Dropdown */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              onClick={() => setActiveMenu(activeMenu === 'tools' ? null : 'tools')}
              disabled={readOnly}
              title={readOnly ? 'Modo leitura — outro utilizador está a editar' : undefined}
              className={`inline-flex items-center justify-center gap-2 min-w-[112px] px-4 h-9 rounded-lg font-bold text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${activeMenu === 'tools' ? 'bg-slate-200 text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <span className="hidden md:inline">Ferramentas</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${activeMenu === 'tools' ? 'rotate-180' : ''}`} />
            </button>

            {activeMenu === 'tools' && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-border rounded-xl shadow-xl py-2 animate-in fade-in slide-in-from-top-2 duration-200 z-[100]">
                <label className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 cursor-pointer transition-colors">
                  <FileUp size={16} className="text-slate-400" />
                  <span>Importação</span>
                  <input type="file" accept=".pdf,.docx,.idml,.zip,.epub,.html,.htm" onChange={onFileSelect} disabled={isLoading} hidden />
                </label>
                <button
                  onClick={() => { onOpenCompare(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <GitCompare size={16} className="text-slate-400" />
                  <span>Comparação</span>
                </button>
                <button
                  onClick={() => { onFetchHistory(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <History size={16} className="text-slate-400" />
                  <span>Histórico</span>
                </button>
                <button
                  onClick={() => { onEditToc(); setActiveMenu(null); }}
                  disabled={readOnly}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  <ListTree size={16} className="text-slate-400" />
                  <span>Editor de TOC</span>
                </button>
                <div className="h-px bg-slate-100 my-1"></div>
                <div className="relative group/aux">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    <Wrench size={16} className="text-slate-400" />
                    <span className="flex-1 text-left">Auxílio</span>
                    <ChevronRight size={14} className="text-slate-400" />
                  </button>
                  <div className="hidden group-hover/aux:block absolute left-full top-0 ml-1 w-56 bg-white border border-border rounded-xl shadow-xl py-2 z-[110]">
                    <button
                      onClick={() => { onConversions(); setActiveMenu(null); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <Wand2 size={16} className="text-slate-400" />
                      <span>Conversões</span>
                    </button>
                    <button
                      onClick={() => { onFixLinks(); setActiveMenu(null); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <Link2 size={16} className="text-slate-400" />
                      <span>Correção de Links</span>
                    </button>
                    <button
                      onClick={() => { onCleanIndex(); setActiveMenu(null); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <ListX size={16} className="text-slate-400 shrink-0" />
                      <span className="flex-1 text-left">Limpeza de Índice Remissivo</span>
                    </button>
                    <button
                      onClick={() => { onShowStats(); setActiveMenu(null); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <Hash size={16} className="text-slate-400" />
                      <span>Estatísticas</span>
                    </button>
                  </div>
                </div>
                <div className="h-px bg-slate-100 my-1"></div>
                <div className="relative group/estilos">
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    <Palette size={16} className="text-slate-400" />
                    <span className="flex-1 text-left">Estilos</span>
                    <ChevronRight size={14} className="text-slate-400" />
                  </button>
                  <div className="hidden group-hover/estilos:block absolute left-full top-0 ml-1 w-56 bg-white border border-border rounded-xl shadow-xl py-2 z-[110]">
                    <button
                      onClick={() => { onShowFonts(); setActiveMenu(null); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <Type size={16} className="text-slate-400" />
                      <span>Fontes</span>
                    </button>
                    <button
                      onClick={() => { onShowStyleEditor(); setActiveMenu(null); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                    >
                      <Palette size={16} className="text-slate-400" />
                      <span>Editor CSS</span>
                    </button>
                  </div>
                </div>
                <div className="h-px bg-slate-100 my-1"></div>
                <button
                  onClick={() => { onShowShortcuts(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <Keyboard size={16} className="text-slate-400" />
                  <span>Atalhos de Teclado</span>
                </button>
              </div>
            )}
          </div>

          {/* Group 4: Validation Dropdown */}
          <div className="relative" ref={validationMenuRef}>
            <button
              onClick={() => setActiveMenu(activeMenu === 'validation' ? null : 'validation')}
              disabled={readOnly}
              title={readOnly ? 'Modo leitura — outro utilizador está a editar' : undefined}
              className={`inline-flex items-center justify-center gap-2 min-w-[112px] px-4 h-9 rounded-lg font-bold text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${activeMenu === 'validation' ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <span className="hidden lg:inline">Validações</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${activeMenu === 'validation' ? 'rotate-180' : ''}`} />
            </button>

            {activeMenu === 'validation' && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-border rounded-xl shadow-xl py-2 animate-in fade-in slide-in-from-top-2 duration-200 z-[100]">
                <button
                  onClick={() => { onToggleGrammar(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <AlertTriangle size={16} className="text-slate-400" />
                  <span>Revisão Gramatical</span>
                </button>
                <div className="h-px bg-slate-100 my-1"></div>
                <button
                  onClick={() => { onValidate(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <Hash size={16} className="text-slate-400" />
                  <span>Validação de Notas</span>
                </button>
                <button
                  onClick={() => { onValidateLinks(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <Link2 size={16} className="text-slate-400" />
                  <span>Validação de Links</span>
                </button>
                <button
                  onClick={() => { onValidateEpub(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <Shield size={16} className="text-slate-400" />
                  <span>Validação Ebook</span>
                </button>
                <button
                  onClick={() => { onValidateAccessibility(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <Accessibility size={16} className="text-slate-400" />
                  <span>Validação Ace</span>
                </button>
              </div>
            )}
          </div>

          {/* Group 5: Export Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button 
              onClick={() => setActiveMenu(activeMenu === 'export' ? null : 'export')}
              className={`inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 min-w-[112px] px-4 h-9 rounded-lg font-bold text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50`}
              disabled={isLoading || !htmlContent}
            >
              {isLoading && <Loader2 className="animate-spin" size={14} />}
              <span>Exportar</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${activeMenu === 'export' ? 'rotate-180' : ''}`} />
            </button>

            {activeMenu === 'export' && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-border rounded-xl shadow-xl py-2 animate-in fade-in slide-in-from-top-2 duration-200 z-[100]">
                <button
                  onClick={() => { onExport(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <Download size={16} />
                  <span>Descarregar EPUB</span>
                </button>
                <div className="h-px bg-slate-100 my-1"></div>
                <button
                  onClick={() => { onPreview(); setActiveMenu(null); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  <Eye size={16} className="text-slate-400" />
                  <span>Pré-visualizar</span>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Right spacer to keep action groups centered */}
        <div className="flex-1" />
      </div>
    </nav>
  );
};

// Memoized export for performance optimization
export const WorkToolbar = React.memo(WorkToolbarComponent);
