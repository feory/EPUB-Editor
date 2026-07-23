import React, { useEffect, useState } from 'react';
import { FileUp, Info, Loader2 } from 'lucide-react';
import type { ImportOptions } from '../../../utils/html-cleaner';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';
import { CONVERSION_OPTIONS } from './conversionOptions';
import { scanDocxStyles } from '../../../services/document-importer';
import { scanIdmlStyles } from '../../../services/idml-importer';
import type { SpacingStyleInfo } from '../../../services/idml-importer';
import type { DocxStyleInfo, DocxStyleTarget, DocxStyleMapping } from '../../../services/document-importer';

interface ImportOptionsModalProps {
    file: File;
    fileName: string;
    onConfirm: (options: ImportOptions, styleMapping?: DocxStyleMapping) => void;
    onClose: () => void;
}

// Rótulos amigáveis para nomes de estilo Word (só display; o mapeamento usa o nome real)
const DISPLAY_NAMES: Record<string, string> = {
    'Body Text': 'texto',
    'List Paragraph': 'Listas',
};

function displayStyleName(name: string): string {
    if (DISPLAY_NAMES[name]) return DISPLAY_NAMES[name];
    const h = name.match(/^Heading (\d+)$/i);
    if (h) return `Título ${h[1]}`;
    return name;
}

const TARGET_OPTIONS: { value: DocxStyleTarget; label: string }[] = [
    { value: 'auto', label: 'Automático' },
    { value: 'h1', label: 'Título 1' },
    { value: 'h2', label: 'Título 2' },
    { value: 'h3', label: 'Título 3' },
    { value: 'p', label: 'Parágrafo' },
    { value: 'p-indent', label: 'Com indentação' },
    { value: 'p-center', label: 'Centrado' },
    { value: 'p-small', label: 'Pequeno' },
    { value: 'p-bold', label: 'Negrito' },
    { value: 'p-italic', label: 'Itálico' },
    { value: 'p-bold-italic', label: 'Negrito + Itálico' },
    { value: 'p-quote', label: 'Citação' },
    { value: 'p-legendas', label: 'Legenda' },
    { value: 'footnote', label: 'Nota de rodapé' },
];

const ImportOptionsModalComponent: React.FC<ImportOptionsModalProps> = ({ file, fileName, onConfirm, onClose }) => {
    useBodyScrollLock();
    const [options, setOptions] = useState<ImportOptions>({
        indentAllParagraphs: false,
        topOnBoldParagraphs: false,
        noIndentAfterBold: false,
        wrapBoldWithNext: false,
        convertListsToDialogue: false,
        detectParagraphSpacing: false,
    });

    const isDocx = fileName.toLowerCase().endsWith('.docx');
    const isIdml = /\.(idml|zip)$/.test(fileName.toLowerCase());
    const isEpub = fileName.toLowerCase().endsWith('.epub');
    const isMapping = isDocx || isIdml; // formatos com mapeamento de estilos
    const [scanning, setScanning] = useState(isMapping);
    const [styles, setStyles] = useState<DocxStyleInfo[]>([]);
    const [mapping, setMapping] = useState<DocxStyleMapping>({});
    const [tab, setTab] = useState<'mapping' | 'conversions'>(isMapping ? 'mapping' : 'conversions');
    const [spacing, setSpacing] = useState<SpacingStyleInfo[]>([]); // IDML: breakdown por estilo detetado na análise

    useEffect(() => {
        if (!isMapping) return;
        let cancelled = false;
        (async () => {
            try {
                if (isIdml) {
                    const { styles: scanned, spacing: detected } = await scanIdmlStyles(file);
                    if (cancelled) return;
                    scanned.sort((a, b) => displayStyleName(a.name).localeCompare(displayStyleName(b.name), 'pt'));
                    setStyles(scanned);
                    setMapping(Object.fromEntries(scanned.map(s => [s.styleId, { target: s.suggested, centered: s.suggestedCentered }])));
                    setSpacing(detected);
                } else {
                    const scanned = await scanDocxStyles(await file.arrayBuffer());
                    if (cancelled) return;
                    scanned.sort((a, b) => displayStyleName(a.name).localeCompare(displayStyleName(b.name), 'pt'));
                    setStyles(scanned);
                    setMapping(Object.fromEntries(scanned.map(s => [s.styleId, { target: s.suggested, centered: s.suggestedCentered }])));
                }
            } finally {
                if (!cancelled) setScanning(false);
            }
        })();
        return () => { cancelled = true; };
    }, [file, isMapping, isIdml]);

    const toggle = (key: keyof ImportOptions) => setOptions(prev => ({ ...prev, [key]: !prev[key] }));
    const setTarget = (styleId: string, target: DocxStyleTarget) =>
        setMapping(prev => ({ ...prev, [styleId]: { ...prev[styleId], target } }));
    const setCentered = (styleId: string, centered: boolean) =>
        setMapping(prev => ({ ...prev, [styleId]: { ...prev[styleId], centered } }));

    const optionList = CONVERSION_OPTIONS;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className={`relative bg-surface rounded-2xl shadow-2xl w-full ${isMapping ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-200`} onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        <FileUp size={20} />
                        Opções de Importação
                    </h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                {isDocx && (
                    <div className="px-6 pt-4 flex gap-1 border-b border-border">
                        <button
                            onClick={() => setTab('mapping')}
                            className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${tab === 'mapping' ? 'bg-slate-100 text-text-main border-b-2 border-primary' : 'text-text-muted hover:text-text-main'}`}
                        >
                            Mapeamento de Estilos
                        </button>
                        <button
                            onClick={() => setTab('conversions')}
                            className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${tab === 'conversions' ? 'bg-slate-100 text-text-main border-b-2 border-primary' : 'text-text-muted hover:text-text-main'}`}
                        >
                            Conversões
                        </button>
                    </div>
                )}

                <div className="p-6 flex flex-col gap-4">
                    <p className="text-sm text-text-muted">
                        Importar <span className="font-bold text-text-main">{fileName}</span> substituirá o conteúdo atual.
                    </p>

                    {isEpub && (
                        <p className="text-sm text-text-muted">
                            O EPUB é importado preservando a sua estrutura (capítulos, notas, imagens e marcadores de página). Sem conversões a aplicar.
                        </p>
                    )}

                    {isMapping && tab === 'mapping' && (
                        <div className="flex flex-col gap-2">
                            {scanning ? (
                                <div className="flex items-center gap-2 text-sm text-text-muted py-4">
                                    <Loader2 size={16} className="animate-spin" /> A analisar estilos…
                                </div>
                            ) : styles.length === 0 ? (
                                <p className="text-sm text-text-muted py-2">Nenhum estilo de parágrafo detetado.</p>
                            ) : (
                                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                                    {styles.map(s => (
                                        <div key={s.styleId} className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-slate-50/50">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-text-main truncate">{displayStyleName(s.name)}</span>
                                                    <span className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-slate-200 text-text-muted">{s.count}</span>
                                                </div>
                                                {s.sample && <p className="text-xs text-text-muted truncate">{s.sample}</p>}
                                            </div>
                                            {mapping[s.styleId]?.target !== 'p-center' && (
                                                <label className="shrink-0 flex items-center gap-1.5 text-xs text-text-muted cursor-pointer" title="Centrar o parágrafo/título">
                                                    <input
                                                        type="checkbox"
                                                        checked={mapping[s.styleId]?.centered ?? false}
                                                        onChange={e => setCentered(s.styleId, e.target.checked)}
                                                        className="accent-primary"
                                                    />
                                                    Centrado
                                                </label>
                                            )}
                                            <select
                                                value={mapping[s.styleId]?.target ?? 'auto'}
                                                onChange={e => setTarget(s.styleId, e.target.value as DocxStyleTarget)}
                                                className="shrink-0 text-sm rounded-lg border border-border bg-white px-2 py-1.5 text-text-main"
                                            >
                                                {TARGET_OPTIONS.map(o => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {isIdml && spacing.length > 0 && (
                        <label className="flex items-start gap-3 p-3 rounded-xl border border-border bg-slate-50/50 cursor-pointer hover:border-primary transition-colors">
                            <input
                                type="checkbox"
                                checked={options.detectParagraphSpacing ?? false}
                                onChange={() => toggle('detectParagraphSpacing')}
                                className="mt-0.5 accent-primary"
                            />
                            <span className="text-sm text-text-main flex-1">
                                Aplicar espaçamento entre parágrafos detetado
                                <span className="text-text-muted"> ({spacing.reduce((n, s) => n + s.count, 0)} parágrafos)</span>
                            </span>
                            <span className="relative group shrink-0">
                                <Info size={16} className="text-text-muted hover:text-primary transition-colors" />
                                <div className="absolute right-0 bottom-full mb-2 w-72 p-2.5 rounded-lg bg-slate-900 text-white text-xs leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                                    <p className="mb-1.5">Espaço antes/depois definido no InDesign, ou linha em branco manual. Aplica aos parágrafos e citações correspondentes.</p>
                                    <div className="flex flex-col gap-0.5">
                                        {spacing.map(s => (
                                            <div key={s.name} className="flex items-center gap-1.5">
                                                <span className="font-semibold">{displayStyleName(s.name)}</span>
                                                <span className="text-slate-400 shrink-0">×{s.count}</span>
                                                <span className="text-slate-300 truncate">
                                                    {s.before <= 0 && s.after <= 0
                                                        ? 'linha em branco'
                                                        : [s.before > 0 ? `topo ${Math.round(s.before)}pt` : '', s.after > 0 ? `fundo ${Math.round(s.after)}pt` : ''].filter(Boolean).join(' · ')}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </span>
                        </label>
                    )}

                    {tab === 'conversions' && !isEpub && optionList.map(({ key, label, description }) => (
                        <label key={key} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-slate-50/50 cursor-pointer hover:border-primary transition-colors">
                            <input
                                type="checkbox"
                                checked={options[key]}
                                onChange={() => toggle(key)}
                                className="mt-0.5 accent-primary"
                            />
                            <span className="text-sm text-text-main flex-1">{label}</span>
                            <span className="relative group shrink-0">
                                <Info size={16} className="text-text-muted hover:text-primary transition-colors" />
                                <span className="absolute right-0 bottom-full mb-2 w-64 p-2.5 rounded-lg bg-slate-900 text-white text-xs leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                                    {description}
                                </span>
                            </span>
                        </label>
                    ))}
                </div>

                <div className="p-6 bg-slate-50 border-t border-border flex gap-3">
                    <button
                        className="flex-1 py-3 border border-border text-text-main rounded-xl font-bold transition-all hover:bg-slate-100 active:scale-95"
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button
                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-md active:scale-95"
                        onClick={() => onConfirm(options, isMapping ? mapping : undefined)}
                    >
                        Importar
                    </button>
                </div>
            </div>
        </div>
    );
};

export const ImportOptionsModal = React.memo(ImportOptionsModalComponent);
