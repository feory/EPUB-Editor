import React from 'react';
import { CheckCircle2, AlertCircle, Hash, FileText, Lightbulb, MapPin, Code, Navigation, Link2 } from 'lucide-react';
import type { ValidationResult } from '../../../api/ebooks-api';
import type { ValidationReport } from '../../../services/footnote-validator';
import type { LinkReport } from '../../../services/link-validator';

// Extract plain text from an HTML string (e.g. "<h3 xmlns="...">Title</h3>" → "Title")
const extractTextFromHtml = (html: string): string =>
  html.replace(/<[^>]+>/g, '').trim();

interface ValidationContentProps {
  results: ValidationResult | null;
  footnoteResults: ValidationReport | null;
  linkResults?: LinkReport | null;
  onGoToIssue?: (context: string) => void;
  onFixLinks?: () => void;
  variant?: 'sidebar' | 'modal';
}

export const ValidationContent: React.FC<ValidationContentProps> = ({
  results,
  footnoteResults,
  linkResults,
  onGoToIssue,
  onFixLinks,
  variant = 'sidebar'
}) => {
  const isSidebar = variant === 'sidebar';

  return (
    <div className={isSidebar ? 'space-y-5' : 'space-y-8'}>
      {/* EPUB Validation Section */}
      {results && (
        <section className={isSidebar ? 'space-y-3' : 'space-y-4'}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <FileText size={14} />
            Conformidade EPUB3
          </h3>

          {results.valid ? (
            <div className={`bg-emerald-50 border border-emerald-100 rounded-xl ${isSidebar ? 'p-4' : 'p-4'}`}>
              <div className="flex items-start gap-3">
                <div className={`rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-600 ${isSidebar ? 'w-8 h-8' : 'w-10 h-10'}`}>
                  <CheckCircle2 size={isSidebar ? 18 : 24} />
                </div>
                <div>
                  <div className="font-bold text-sm text-emerald-900">Estrutura Válida</div>
                  <div className="text-xs text-emerald-700 mt-1">
                    O ficheiro cumpre as normas oficiais de publicação.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={`bg-rose-50 border border-rose-100 rounded-xl ${isSidebar ? 'p-4 mb-3' : 'p-4'}`}>
              <div className="flex items-start gap-3">
                <div className={`rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600 ${isSidebar ? 'w-8 h-8' : 'w-10 h-10'}`}>
                  <AlertCircle size={isSidebar ? 18 : 24} />
                </div>
                <div>
                  <div className="font-bold text-sm text-rose-900">Erros de Conformidade</div>
                  <div className="text-xs text-rose-700 mt-1">
                    {isSidebar ? 'O ficheiro contém erros técnicos.' : 'O ficheiro gerado contém erros técnicos que impedem a publicação.'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Errors and Warnings */}
          {(results.errors.length > 0 || results.warnings.length > 0) && (
            <div className={isSidebar ? 'space-y-3' : 'space-y-2'}>
              {results.errors.map((err, i) => {
                if (!isSidebar) {
                  // Simple modal version
                  return (
                    <div key={`err-${i}`} className="p-3 text-xs text-rose-700 bg-rose-50/50 border border-rose-100 rounded-lg font-mono">
                      {err.message}
                    </div>
                  );
                }

                // Detailed sidebar version
                const rule = err.rule || 'Unknown';
                const description = err.description || err.message || 'No description';
                const file = err.file || '';
                const impact = err.impact || 'serious';
                const location = err.location;
                const html = err.html;

                const isNavigable = !!(html && onGoToIssue);
                return (
                  <div
                    key={`err-${i}`}
                    className={`bg-white border border-rose-200 rounded-xl p-3 shadow-sm transition-all ${isNavigable ? 'cursor-pointer hover:border-primary hover:shadow-md' : ''}`}
                    onClick={() => { if (isNavigable) onGoToIssue!(extractTextFromHtml(html!)); }}
                    title={isNavigable ? 'Clique para ir ao local no editor' : undefined}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                        <AlertCircle size={14} className="text-rose-600" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-rose-900 leading-tight">{rule}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700">
                            {impact}
                          </span>
                          {isNavigable && (
                            <span className="ml-auto flex items-center gap-1 text-[9px] font-bold text-primary uppercase tracking-wider">
                              <Navigation size={9} />
                              Ir ao editor
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-700 leading-relaxed break-words">
                          {description}
                        </div>
                        {file && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            <FileText size={10} className="shrink-0" />
                            <span className="truncate">{file}</span>
                          </div>
                        )}
                        {location && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-white bg-black px-2 py-1 rounded border border-slate-700">
                            <MapPin size={10} className="shrink-0" />
                            <span className="truncate">{location}</span>
                          </div>
                        )}
                        {html && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              <Code size={10} />
                              <span>Código</span>
                            </div>
                            <pre className="text-[10px] font-mono text-slate-700 bg-slate-50 px-2 py-1.5 rounded border border-slate-100 overflow-x-auto whitespace-pre-wrap break-all">
                              {html}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {results.warnings.map((warn, i) => {
                if (!isSidebar) {
                  // Simple modal version
                  return (
                    <div key={`warn-${i}`} className="p-3 text-xs text-amber-700 bg-amber-50/50 border border-amber-100 rounded-lg font-mono">
                      {warn.message}
                    </div>
                  );
                }

                // Detailed sidebar version
                const isBestPractice = warn.impact === 'best-practice' || warn.outcome === 'cantTell';
                const rule = warn.rule || 'Unknown';
                const description = warn.description || warn.message || 'No description';
                const file = warn.file || '';
                const impact = warn.impact || 'moderate';
                const location = warn.location;
                const html = warn.html;
                const borderColor = isBestPractice ? 'border-slate-800' : 'border-amber-200';
                const bgColor = isBestPractice ? 'bg-black' : 'bg-amber-50';
                const textColor = isBestPractice ? 'text-slate-900' : 'text-amber-900';
                const badgeBg = isBestPractice ? 'bg-black' : 'bg-amber-100';
                const badgeText = isBestPractice ? 'text-white' : 'text-amber-700';
                const iconColor = isBestPractice ? 'text-white' : 'text-amber-600';

                const isNavigable = !!(html && onGoToIssue);
                return (
                  <div
                    key={`warn-${i}`}
                    className={`bg-white border ${borderColor} rounded-xl p-3 shadow-sm transition-all ${isNavigable ? 'cursor-pointer hover:border-primary hover:shadow-md' : ''}`}
                    onClick={() => { if (isNavigable) onGoToIssue!(extractTextFromHtml(html!)); }}
                    title={isNavigable ? 'Clique para ir ao local no editor' : undefined}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-6 h-6 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
                        {isBestPractice ? (
                          <Lightbulb size={14} className={iconColor} />
                        ) : (
                          <AlertCircle size={14} className={iconColor} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold text-sm ${textColor} leading-tight`}>{rule}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${badgeBg} ${badgeText}`}>
                            {isBestPractice ? 'Best Practice' : impact}
                          </span>
                          {isNavigable && (
                            <span className="ml-auto flex items-center gap-1 text-[9px] font-bold text-primary uppercase tracking-wider">
                              <Navigation size={9} />
                              Ir ao editor
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-700 leading-relaxed break-words">
                          {description}
                        </div>
                        {file && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            <FileText size={10} className="shrink-0" />
                            <span className="truncate">{file}</span>
                          </div>
                        )}
                        {location && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-white bg-black px-2 py-1 rounded border border-slate-700">
                            <MapPin size={10} className="shrink-0" />
                            <span className="truncate">{location}</span>
                          </div>
                        )}
                        {html && (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              <Code size={10} />
                              <span>Código</span>
                            </div>
                            <pre className="text-[10px] font-mono text-slate-700 bg-slate-50 px-2 py-1.5 rounded border border-slate-100 overflow-x-auto whitespace-pre-wrap break-all">
                              {html}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Footnotes Validation Section */}
      {footnoteResults && (
        <section className={`${isSidebar ? 'space-y-3 pt-3 border-t border-slate-200' : 'space-y-4 pt-4 border-t border-slate-100'}`}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <Hash size={14} />
            {isSidebar ? 'Notas de Rodapé' : 'Integridade de Notas'} ({footnoteResults.totalRefs} Refs / {footnoteResults.totalNotes} Notas)
          </h3>

          {footnoteResults.issues.length === 0 ? (
            <div className={`bg-emerald-50 border border-emerald-100 rounded-xl ${isSidebar ? 'p-4' : 'p-4'}`}>
              <div className="flex items-start gap-3">
                <div className={`rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-600 ${isSidebar ? 'w-8 h-8' : 'w-10 h-10'}`}>
                  <CheckCircle2 size={isSidebar ? 18 : 24} />
                </div>
                <div>
                  <div className="font-bold text-sm text-emerald-900">Notas Integradas</div>
                  <div className="text-xs text-emerald-700 mt-1">
                    Todas as referências estão corretamente ligadas{isSidebar ? '.' : ' às suas notas.'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {footnoteResults.issues.map((issue, i) => {
                const isError = issue.type === 'orphan-ref' || issue.type === 'broken-link';
                const typeConfig: Record<string, { label: string; borderColor: string; iconBg: string; iconColor: string; badgeBg: string; badgeText: string }> = {
                  'orphan-ref': { label: 'Ref. Sem Nota', borderColor: 'border-rose-200', iconBg: 'bg-rose-100', iconColor: 'text-rose-600', badgeBg: 'bg-rose-100', badgeText: 'text-rose-700' },
                  'orphan-note': { label: 'Nota Sem Ref.', borderColor: 'border-amber-200', iconBg: 'bg-amber-100', iconColor: 'text-amber-600', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700' },
                  'sequence-gap': { label: 'Sequência', borderColor: 'border-amber-200', iconBg: 'bg-amber-100', iconColor: 'text-amber-600', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700' },
                  'broken-link': { label: 'Ligação Inválida', borderColor: 'border-rose-200', iconBg: 'bg-rose-100', iconColor: 'text-rose-600', badgeBg: 'bg-rose-100', badgeText: 'text-rose-700' },
                };
                const cfg = typeConfig[issue.type] ?? typeConfig['orphan-ref'];
                const isNavigable = !!(onGoToIssue && issue.context);
                return (
                  <div
                    key={i}
                    className={`bg-white border ${cfg.borderColor} rounded-xl p-3 shadow-sm transition-all ${isNavigable ? 'cursor-pointer hover:border-primary hover:shadow-md' : ''}`}
                    onClick={() => { if (isNavigable) onGoToIssue!(issue.context!); }}
                    title={isNavigable ? 'Clique para ir ao local no editor' : undefined}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`w-6 h-6 rounded-lg ${cfg.iconBg} flex items-center justify-center shrink-0`}>
                        <AlertCircle size={14} className={cfg.iconColor} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold text-sm leading-tight ${isError ? 'text-rose-900' : 'text-amber-900'}`}>
                            {issue.message}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${cfg.badgeBg} ${cfg.badgeText}`}>
                            {cfg.label}
                          </span>
                          {issue.marker && issue.marker !== '?' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600">
                              [{issue.marker}]
                            </span>
                          )}
                          {isNavigable && (
                            <span className="ml-auto flex items-center gap-1 text-[9px] font-bold text-primary uppercase tracking-wider">
                              <Navigation size={9} />
                              Ir ao editor
                            </span>
                          )}
                        </div>
                        {issue.context && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 truncate">
                            <Hash size={10} className="shrink-0" />
                            <span className="truncate">...{issue.context}...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Links Validation Section */}
      {linkResults && (
        <section className={`${isSidebar ? 'space-y-3 pt-3 border-t border-slate-200' : 'space-y-4 pt-4 border-t border-slate-100'}`}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <Link2 size={14} />
            Links ({linkResults.totalLinks} analisados)
          </h3>

          {linkResults.issues.length === 0 ? (
            <div className={`bg-emerald-50 border border-emerald-100 rounded-xl ${isSidebar ? 'p-4' : 'p-4'}`}>
              <div className="flex items-start gap-3">
                <div className={`rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-600 ${isSidebar ? 'w-8 h-8' : 'w-10 h-10'}`}>
                  <CheckCircle2 size={isSidebar ? 18 : 24} />
                </div>
                <div>
                  <div className="font-bold text-sm text-emerald-900">Links Válidos</div>
                  <div className="text-xs text-emerald-700 mt-1">Nenhum link com espaços no endereço.</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {onFixLinks && (
                <button
                  onClick={onFixLinks}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 text-white font-bold text-xs hover:bg-slate-800 transition-all shadow-sm active:scale-95"
                >
                  <Link2 size={14} />
                  Corrigir
                </button>
              )}
              {linkResults.issues.map((issue, i) => {
                const isNavigable = !!(onGoToIssue && issue.context);
                return (
                  <div
                    key={i}
                    className={`bg-white border border-rose-200 rounded-xl p-3 shadow-sm transition-all ${isNavigable ? 'cursor-pointer hover:border-primary hover:shadow-md' : ''}`}
                    onClick={() => { if (isNavigable) onGoToIssue!(issue.context); }}
                    title={isNavigable ? 'Clique para ir ao local no editor' : undefined}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                        <Link2 size={14} className="text-rose-600" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-rose-900 leading-tight">{issue.message}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700">
                            {issue.type === 'spaced-href' ? 'Href' : 'URL'}
                          </span>
                          {isNavigable && (
                            <span className="ml-auto flex items-center gap-1 text-[9px] font-bold text-primary uppercase tracking-wider">
                              <Navigation size={9} />
                              Ir ao editor
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-rose-700 bg-rose-50/60 px-2 py-1 rounded border border-rose-100 break-all">
                          {issue.url}
                        </div>
                        {issue.context && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 truncate">
                            <Hash size={10} className="shrink-0" />
                            <span className="truncate">...{issue.context}...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Empty State */}
      {!results && !footnoteResults && !linkResults && isSidebar && (
        <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 px-10 text-center">
          <CheckCircle2 size={48} className="text-slate-200" />
          <h4 className="font-bold text-slate-900">Nenhuma Validação</h4>
          <p className="text-sm leading-relaxed">Execute a validação para ver os resultados aqui.</p>
        </div>
      )}
    </div>
  );
};
