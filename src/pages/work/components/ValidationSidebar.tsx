import React from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ValidationResult } from '../../../api/ebooks-api';
import type { ValidationReport } from '../../../services/footnote-validator';
import type { LinkReport } from '../../../services/link-validator';
import { ValidationContent } from './ValidationContent';

interface ValidationSidebarProps {
  results: ValidationResult | null;
  footnoteResults: ValidationReport | null;
  linkResults?: LinkReport | null;
  onClose: () => void;
  onGoToIssue?: (context: string) => void;
  onFixLinks?: () => void;
}

const ValidationSidebarComponent: React.FC<ValidationSidebarProps> = ({
  results,
  footnoteResults,
  linkResults,
  onClose,
  onGoToIssue,
  onFixLinks
}) => {
  const hasIssues = (results && (!results.valid || (results.warnings && results.warnings.length > 0))) || (footnoteResults && footnoteResults.issues.length > 0) || (linkResults && linkResults.issues.length > 0);
  const totalIssues = (results?.errors.length || 0) + (results?.warnings.length || 0) + (footnoteResults?.issues.length || 0) + (linkResults?.issues.length || 0);

  return (
    <aside className="fixed right-4 top-[89px] bottom-8 w-[500px] bg-white shadow-[-10px_0_30px_rgba(0,0,0,0.05)] border border-border rounded-2xl overflow-hidden flex flex-col z-40 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            hasIssues ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'
          }`}>
            {hasIssues ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          </div>
          <div>
            <h3 className="font-black text-slate-900 leading-tight">Validação</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {totalIssues === 0 ? 'Tudo em ordem' : `${totalIssues} ${totalIssues === 1 ? 'Problema' : 'Problemas'}`}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-rose-500 transition-all"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
        <ValidationContent
          results={results}
          footnoteResults={footnoteResults}
          linkResults={linkResults}
          onGoToIssue={onGoToIssue}
          onFixLinks={onFixLinks}
          variant="sidebar"
        />
      </div>
    </aside>
  );
};

// Memoized export for performance optimization
export const ValidationSidebar = React.memo(ValidationSidebarComponent);
