import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Save, Eye, EyeOff, ChevronRight, Search, X } from 'lucide-react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';
import { css } from '@codemirror/lang-css';
import { EditorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { foldEffect, unfoldAll } from '@codemirror/language';
import { useStyles } from '../../../context/StyleContext';
import { ebooksApi } from '../../../api/ebooks-api';

interface StyleEditorModalProps {
  isbn: string;
  onClose: () => void;
}

const SECTION_PATTERN = /\/\* === (.+?) === \*\//;

// Referências estáveis — recriar a cada render faz o CodeMirror reconfigurar o estado
// interno (fecha o painel de busca nativo a meio da digitação).
const CSS_EXTENSIONS = [css()];
const CM_BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  highlightSelectionMatches: true,
  autocompletion: true,
  bracketMatching: true,
  indentOnInput: true,
  closeBrackets: true,
};

function parseSections(cssText: string): { name: string; line: number }[] {
  return cssText.split('\n').flatMap((line, i) => {
    const match = SECTION_PATTERN.exec(line);
    return match ? [{ name: match[1], line: i + 1 }] : [];
  });
}

// Blocos de linhas que NÃO contêm o termo, expressos como posições (fim da linha anterior →
// fim da última linha do bloco) para dobrar (fold) via `foldEffect` — usar `display:none` numa
// decoração custom desalinha a gutter de números (não sabe que a linha colapsou); o fold nativo
// já é entendido pela gutter (`foldGutter`, já ligada no `basicSetup`).
function computeHiddenRanges(state: EditorState, query: string): { from: number; to: number }[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const ranges: { from: number; to: number }[] = [];
  const total = state.doc.lines;
  let i = 1;
  while (i <= total) {
    if (state.doc.line(i).text.toLowerCase().includes(q)) { i++; continue; }
    let j = i;
    while (j <= total && !state.doc.line(j).text.toLowerCase().includes(q)) j++;
    const from = i === 1 ? 0 : state.doc.line(i - 1).to;
    const to = state.doc.line(j - 1).to;
    if (to > from) ranges.push({ from, to });
    i = j;
  }
  return ranges;
}

const StyleEditorModalComponent: React.FC<StyleEditorModalProps> = ({ isbn, onClose }) => {
  useBodyScrollLock();
  const { customCss, setCustomCss, setTempCss: setTempCssContext } = useStyles();

  const [localCss, setLocalCss] = useState(customCss);
  const [showPreview, setShowPreview] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const filterQueryRef = useRef('');
  const filterRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => parseSections(localCss), [localCss]);

  // Clicar fora colapsa a pesquisa (só quando vazia — não destrói um filtro ativo)
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node) && !filterQuery) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [filterOpen, filterQuery]);

  const applyLineFilter = useCallback((view: EditorView, query: string) => {
    unfoldAll(view);
    const ranges = computeHiddenRanges(view.state, query);
    if (ranges.length > 0) {
      view.dispatch({ effects: ranges.map(r => foldEffect.of(r)) });
    }
  }, []);

  useEffect(() => {
    filterQueryRef.current = filterQuery;
    const view = cmRef.current?.view;
    if (view) applyLineFilter(view, filterQuery);
  }, [filterQuery, applyLineFilter]);

  // useCallback: referência estável — o `useCodeMirror` interno reconfigura
  // (StateEffect.reconfigure) sempre que `onChange` muda de identidade, o que fecha
  // o painel de busca nativo a meio da digitação.
  const handleCssChange = useCallback((value: string) => {
    setLocalCss(value);
    setTempCssContext(value);
    // Reaplica o filtro (linhas podem ter mudado) sem depender de `filterQuery` — manteria
    // esta função instável e voltaria a partir o painel de busca.
    const view = cmRef.current?.view;
    if (view && filterQueryRef.current) applyLineFilter(view, filterQueryRef.current);
  }, [setTempCssContext, applyLineFilter]);

  const handleSave = async () => {
    setCustomCss(localCss);
    setTempCssContext(null);
    await ebooksApi.saveStyle(isbn, localCss);
    onClose();
  };

  const handleCancel = () => {
    setTempCssContext(null);
    onClose();
  };

  const jumpToSection = useCallback((lineNumber: number, name: string) => {
    setActiveSection(name);
    const view = cmRef.current?.view;
    if (!view) return;
    const doc = view.state.doc;
    if (lineNumber > doc.lines) return;
    const line = doc.line(lineNumber);
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 20 }),
    });
    view.focus();
  }, []);

  const previewContent = `
    <h1>Título Principal</h1>
    <h2>Subtítulo do Capítulo</h2>
    <p>Este é um parágrafo normal sem indentação. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
    <p>Outro parágrafo para demonstrar o espaçamento entre parágrafos.</p>
    <p class="p-indent">Parágrafo com indentação na primeira linha.</p>
    <p class="drop-cap">Parágrafo com capitular na primeira letra para início de capítulo.</p>
    <p class="p-top">Parágrafo de topo com margem superior extra.</p>
    <p class="p-small">Parágrafo com texto mais pequeno.</p>
    <p class="p-bold">Parágrafo todo em negrito.</p>
    <p class="p-italic">Parágrafo todo em itálico.</p>
    <p class="p-bold-italic">Parágrafo todo em negrito + itálico.</p>
    <p class="p-border-top">Parágrafo com borda no topo.</p>
    <p class="p-border-bottom">Parágrafo com borda em baixo.</p>
    <p class="p-border-sides">Parágrafo com bordas laterais.</p>
    <hr class="footnote-sep" />
    <p class="footnote">1. Nota de rodapé com formatação especial.</p>
  `;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />
      <div className={`relative bg-surface rounded-2xl shadow-2xl w-full h-[95vh] flex flex-col animate-in fade-in zoom-in duration-200 transition-all ${showPreview ? 'max-w-7xl' : 'max-w-3xl'}`} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-700">Editor CSS</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              title="Guardar Alterações"
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all"
            >
              <Save size={20} />
            </button>
            <ModalCloseButton onClick={handleCancel} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6 flex gap-4 min-h-0">

          {/* Section Navigator */}
          <div className="w-44 shrink-0 flex flex-col gap-1 mt-11">
            <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Secções</p>
            {sections.map(({ name, line }) => (
              <button
                key={name}
                onClick={() => jumpToSection(line, name)}
                className={`flex items-center gap-1.5 w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors truncate
                  ${activeSection === name
                    ? 'bg-slate-800 text-white'
                    : 'text-text-muted hover:bg-slate-100 hover:text-text-main'
                  }`}
              >
                <ChevronRight size={12} className="shrink-0" />
                <span className="truncate">{name}</span>
              </button>
            ))}
          </div>

          {/* Editor + Preview */}
          <div className="flex-1 flex gap-4 min-w-0">
            {/* Editor Area */}
            <div className={`flex flex-col ${showPreview ? 'w-1/2' : 'w-full'} transition-all min-w-0`}>
              <div className="flex items-center justify-end mb-3 gap-3">
                <div className="flex items-center gap-2">
                  {filterOpen ? (
                    <div ref={filterRef} className="relative w-52 animate-in fade-in slide-in-from-right-2 duration-200">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        autoFocus
                        value={filterQuery}
                        onChange={e => setFilterQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') { setFilterQuery(''); setFilterOpen(false); } }}
                        placeholder="Filtrar linhas..."
                        className="w-full pl-7 pr-7 h-8 rounded-lg border border-border bg-slate-50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-xs transition-all"
                      />
                      <button onClick={() => { setFilterQuery(''); setFilterOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setFilterOpen(true)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all" title="Filtrar linhas">
                      <Search size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-text-main rounded-lg transition-colors shrink-0"
                  >
                    {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                    {showPreview ? 'Ocultar Preview' : 'Preview'}
                  </button>
                </div>
              </div>
              <div className="flex-1 border border-border rounded-xl overflow-hidden">
                <CodeMirror
                  ref={cmRef}
                  value={localCss}
                  height="100%"
                  theme="light"
                  extensions={CSS_EXTENSIONS}
                  onChange={handleCssChange}
                  style={{ height: '100%', fontSize: '13px' }}
                  basicSetup={CM_BASIC_SETUP}
                />
              </div>
            </div>

            {/* Preview Area */}
            {showPreview && (
              <div className="w-1/2 flex flex-col min-w-0 mt-11">
                <iframe
                  className="flex-1 border border-border rounded-xl w-full bg-white"
                  title="Preview CSS"
                  sandbox=""
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${localCss}</style></head><body>${previewContent}</body></html>`}
                />
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export const StyleEditorModal = React.memo(StyleEditorModalComponent);
