import React, { useEffect, useMemo, useRef } from 'react';
import { X, Eraser, Check } from 'lucide-react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';

type FilterType = 'all' | 'spelling' | 'grammar';

// Bottom spacer for the virtual list (mirrors the old p-5 bottom padding). Hoisted = stable identity.
const ListFooter = () => <div className="h-5" />;

interface GrammarSidebarProps {
  issues: any[];
  onClose: () => void;
  onGoToIssue: (context: string, paragraphIndex: number) => void;
  onRecheck: () => void;
  onClearHighlights?: () => void;
  onResolveIssue: (index: number) => void;
  onApplySuggestion: (index: number, suggestion: string) => void;
  onResolveMultiple: (indices: number[]) => void;
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  selectedErrorIndex?: number | null;
}

const GrammarSidebarComponent: React.FC<GrammarSidebarProps> = ({
    issues, onClose, onGoToIssue, onClearHighlights, onResolveIssue, onApplySuggestion,
    onResolveMultiple, filter, onFilterChange, selectedErrorIndex
}) => {
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const spellingCount = issues.filter(i => i.rule?.issueType === 'misspelling').length;
  const grammarCount = issues.length - spellingCount;

  const filtered = issues
    .map((issue, originalIndex) => ({ issue, originalIndex }))
    .filter(({ issue }) => {
      const isSpelling = issue.rule?.issueType === 'misspelling';
      if (filter === 'spelling') return isSpelling;
      if (filter === 'grammar') return !isSpelling;
      return true;
    });

  // Map (rule.id + error word) → all originalIndices visible in current filter
  const ruleIndexMap = useMemo(() => {
    const map = new Map<string, number[]>();
    filtered.forEach(({ issue, originalIndex }) => {
      const ruleId = issue.rule?.id || 'unknown';
      const errorWord = issue.word
        ?? (issue.context
          ? issue.context.text.substring(issue.context.offset, issue.context.offset + issue.context.length)
          : '');
      const key = `${ruleId}|${errorWord}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(originalIndex);
    });
    return map;
  }, [filtered]);

  useEffect(() => {
    if (selectedErrorIndex === undefined || selectedErrorIndex === null) return;
    // selectedErrorIndex is an originalIndex → map to its position in the (filtered) virtual list
    const pos = filtered.findIndex(f => f.originalIndex === selectedErrorIndex);
    if (pos >= 0) virtuosoRef.current?.scrollToIndex({ index: pos, align: 'center', behavior: 'smooth' });
  }, [selectedErrorIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="fixed right-0 top-20 bottom-0 w-[500px] bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border-l border-border flex flex-col z-40 animate-in slide-in-from-right duration-300">
      <div className="p-5 border-b border-border flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
            <div>
                <h3 className="font-black text-slate-900 leading-tight">Revisão</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {issues.length} {issues.length === 1 ? 'Problema detetado' : 'Problemas detetados'}
                </p>
            </div>
        </div>
        <div className="flex items-center gap-1">
            {onClearHighlights && (
                <button
                    onClick={onClearHighlights}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
                    title="Limpar marcas no texto"
                >
                    <Eraser size={18} />
                </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all">
                <X size={20} />
            </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-white">
        {([
          { key: 'all',      label: 'Todos',      count: issues.length },
          { key: 'spelling', label: 'Ortografia', count: spellingCount },
          { key: 'grammar',  label: 'Gramática',  count: grammarCount },
        ] as { key: FilterType; label: string; count: number }[]).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filter === key
                ? key === 'spelling' ? 'bg-rose-100 text-rose-700'
                : key === 'grammar'  ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-700 text-white'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {label}
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
              filter === key ? 'bg-white/30' : 'bg-slate-100'
            }`}>{count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 bg-slate-50/50 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 px-10 text-center">
            <h4 className="font-bold text-slate-900">Documento Limpo</h4>
            <p className="text-sm leading-relaxed">Não foram encontrados erros gramaticais ou ortográficos neste capítulo.</p>
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: '100%' }}
            data={filtered}
            components={{ Footer: ListFooter }}
            itemContent={(_i, { issue, originalIndex }) => {
            const isSpelling = issue.rule?.issueType === 'misspelling';
            const errorWord = issue.word
              ?? (issue.context
                ? issue.context.text.substring(issue.context.offset, issue.context.offset + issue.context.length)
                : '');
            const ruleKey = `${issue.rule?.id || 'unknown'}|${errorWord}`;
            const sameRuleIndices = ruleIndexMap.get(ruleKey) ?? [];
            const sameCount = sameRuleIndices.length;

            return (
              <div className="px-5 pt-5">
              <div
                className={`group bg-white rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden ${
                    selectedErrorIndex === originalIndex
                      ? 'border-primary ring-4 ring-primary/5 shadow-lg translate-x-[-8px]'
                      : 'border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
                }`}
                onClick={() => onGoToIssue(issue.context?.text || '', issue.paragraphIndex)}
              >
                <div className={`h-1 w-full ${isSpelling ? 'bg-rose-400' : 'bg-amber-400'}`}></div>

                <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                        <span className={`text-[10px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded ${isSpelling ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>
                            {isSpelling ? 'Ortografia' : 'Gramática'}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => { e.stopPropagation(); onResolveIssue(originalIndex); }}
                                className="w-7 h-7 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-colors shadow-sm"
                                title="Corrigido"
                            >
                                <Check size={14} />
                            </button>
                            {sameCount > 1 && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onResolveMultiple(sameRuleIndices); }}
                                    className="h-7 px-2 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full transition-colors shadow-sm text-[11px] font-black"
                                    title={`Marcar os ${sameCount} erros iguais como corrigidos`}
                                >
                                    <Check size={11} />
                                    {sameCount}
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); onResolveIssue(originalIndex); }}
                                className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-full transition-all"
                                title="Rejeitar"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 mb-2 leading-snug">
                        {issue.shortMessage || 'Sugestão de Estilo'}
                    </h4>

                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                        {issue.message}
                    </p>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm font-serif italic text-slate-700 mb-4 relative overflow-hidden">
                        <div className="relative z-10">
                            {issue.context ? (
                                <>
                                <span className="opacity-40 tracking-tighter">...</span>
                                {issue.context.text.substring(Math.max(0, issue.context.offset - 40), issue.context.offset)}
                                <span className="bg-amber-200/60 font-bold text-slate-900 px-0.5 rounded mx-0.5 border-b-2 border-amber-400">
                                    {issue.context.text.substring(issue.context.offset, issue.context.offset + issue.context.length)}
                                </span>
                                {issue.context.text.substring(issue.context.offset + issue.context.length, Math.min(issue.context.text.length, issue.context.offset + issue.context.length + 40))}
                                <span className="opacity-40 tracking-tighter">...</span>
                                </>
                            ) : 'Contexto não disponível'}
                        </div>
                    </div>

                    {issue.replacements && issue.replacements.length > 0 && (
                        <div className="flex flex-wrap gap-2 items-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sugestões:</span>
                            {issue.replacements.slice(0, 3).map((r: any, idx: number) => (
                                <button
                                    key={idx}
                                    onClick={(e) => { e.stopPropagation(); onApplySuggestion(originalIndex, r.value); }}
                                    className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer"
                                >
                                    {r.value}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
              </div>
              </div>
            );
          }}
          />
        )}
      </div>
    </aside>
  );
};

export const GrammarSidebar = React.memo(GrammarSidebarComponent);
