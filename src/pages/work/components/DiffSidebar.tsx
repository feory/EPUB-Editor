import React, { useState } from 'react';
import { X, GitCompare, Plus, Minus, Equal, ChevronDown, ChevronUp, Loader2, ArrowUpRight, Pencil } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import type { DiffItem } from '../../../workers/diff.worker';
import { CharDiff } from './DiffCharView';

interface DiffSidebarProps {
  items: DiffItem[];
  fileName: string;
  isLoading: boolean;
  isUpdating: boolean;
  onClose: () => void;
  onGoToItem: (editorIndex: number) => void;
  labelInsert?: string; // rótulo do lado "adicionado" (default: Editor)
  labelDelete?: string; // rótulo do lado "removido" (default: Ficheiro)
}

type DiffGroup = { type: DiffItem['type']; items: DiffItem[] };

function groupItems(items: DiffItem[]): DiffGroup[] {
  const groups: DiffGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    // 'modify' items are never merged into a group — each gets its own section
    if (last && last.type === item.type && item.type !== 'modify') {
      last.items.push(item);
    } else {
      groups.push({ type: item.type, items: [item] });
    }
  }
  return groups;
}


export const DiffSidebar: React.FC<DiffSidebarProps> = ({ items, fileName, isLoading, isUpdating, onClose, onGoToItem, labelInsert = 'Editor', labelDelete = 'Ficheiro' }) => {
  const [showEqual, setShowEqual] = useState(false);

  const { insertCount, deleteCount, modifyCount, equalCount } = items.reduce(
    (acc, i) => { acc[`${i.type}Count`]++; return acc; },
    { insertCount: 0, deleteCount: 0, modifyCount: 0, equalCount: 0 }
  );

  const visibleItems = showEqual ? items : items.filter(i => i.type !== 'equal');
  const groups = groupItems(visibleItems);

  const renderGroup = (group: DiffGroup, gi: number) => {
    if (group.type === 'equal') {
      return (
        <div className="border-b border-slate-100">
          <div className="border-l-2 border-slate-200 mx-3 my-1">
            {group.items.map((item, ii) => (
              <p key={`eq-${gi}-${ii}`} className="px-3 py-1.5 text-[11px] text-slate-400 line-clamp-1">
                {item.editorText}
              </p>
            ))}
          </div>
        </div>
      );
    }
    if (group.type === 'insert') {
      return (
        <div className="border-b border-slate-100">
          <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
            <Plus size={11} strokeWidth={3} className="text-emerald-600 shrink-0" />
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
              {labelInsert} {group.items.length > 1 ? `· ${group.items.length}` : ''}
            </span>
          </div>
          <div className="border-l-2 border-emerald-400 mx-3 mb-2">
            {group.items.map((item, ii) => (
              <button
                key={`ins-${gi}-${ii}-${(item.editorText ?? '').slice(0, 30)}`}
                onClick={() => item.editorIndex !== undefined && onGoToItem(item.editorIndex)}
                className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 transition-colors group focus:outline-none"
              >
                <p className="text-[12px] text-slate-700 line-clamp-2 group-hover:text-slate-900">
                  {item.editorText}
                </p>
                <span className="text-[10px] text-emerald-500 flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowUpRight size={10} /> ir para parágrafo
                </span>
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (group.type === 'delete') {
      return (
        <div className="border-b border-slate-100">
          <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
            <Minus size={11} strokeWidth={3} className="text-rose-500 shrink-0" />
            <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">
              {labelDelete} {group.items.length > 1 ? `· ${group.items.length}` : ''}
            </span>
          </div>
          <div className="border-l-2 border-rose-400 mx-3 mb-2">
            {group.items.map((item, ii) => (
              <div key={`del-${gi}-${ii}-${(item.refText ?? '').slice(0, 30)}`} className="px-3 py-1.5">
                <p className="text-[12px] text-slate-500 line-clamp-2">{item.refText}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (group.type === 'modify') {
      const item = group.items[0];
      return (
        <div className="border-b border-slate-100">
          <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
            <Pencil size={11} className="text-amber-500 shrink-0" />
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Modificado</span>
          </div>
          <button
            onClick={() => item.editorIndex !== undefined && onGoToItem(item.editorIndex)}
            className="w-full text-left border-l-2 border-amber-400 mx-3 mb-2 px-3 py-1.5 hover:bg-amber-50 transition-colors group focus:outline-none"
            style={{ width: 'calc(100% - 1.5rem)' }}
          >
            {item.charDiff && item.charDiff.length > 0
              ? <CharDiff parts={item.charDiff} />
              : <p className="text-[12px] text-slate-700">{item.editorText}</p>
            }
            <span className="text-[10px] text-amber-500 flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowUpRight size={10} /> ir para parágrafo
            </span>
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <aside className="fixed right-4 top-[89px] bottom-8 w-[500px] bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border border-border rounded-2xl overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">

      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-border bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <GitCompare size={16} className="text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="font-black text-slate-900 text-sm leading-tight">Comparação</h3>
              <p className="text-[10px] font-semibold text-slate-400 truncate max-w-[280px] flex items-center gap-1" title={fileName}>
                {fileName}
                {isUpdating && <Loader2 size={9} className="animate-spin shrink-0" />}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all shrink-0">
            <X size={18} />
          </button>
        </div>

        {!isLoading && items.length > 0 && (
          <div className="flex items-center gap-1.5">
            {modifyCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[11px] font-bold">
                <Pencil size={10} />
                {modifyCount}
              </span>
            )}
            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[11px] font-bold">
              <Plus size={10} strokeWidth={3} />
              {insertCount}
            </span>
            <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-600 px-2 py-0.5 rounded text-[11px] font-bold">
              <Minus size={10} strokeWidth={3} />
              {deleteCount}
            </span>
            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[11px] font-bold">
              <Equal size={10} />
              {equalCount}
            </span>
            <button
              onClick={() => setShowEqual(v => !v)}
              className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
            >
              {showEqual ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showEqual ? 'Ocultar iguais' : 'Ver iguais'}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden bg-slate-50/40">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <Loader2 size={24} className="animate-spin" />
            <p className="text-sm font-semibold">A comparar documentos...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400 px-8 text-center">
            <GitCompare size={28} />
            <p className="text-sm font-semibold text-slate-600">Sem diferenças</p>
            <p className="text-xs">O conteúdo do editor é idêntico ao ficheiro de referência.</p>
          </div>
        ) : (
          <Virtuoso
            style={{ height: '100%' }}
            data={groups}
            itemContent={(gi, group) => renderGroup(group, gi)}
          />
        )}
      </div>
    </aside>
  );
};
