import React, { useRef, useState } from 'react';
import { RefreshCw, Upload, Loader2 } from 'lucide-react';
import { ebooksApi } from '../../../api/ebooks-api';
import { extractPdfPageAnchors } from '../../../services/page-list';
import type { PageAnchor } from '../../../services/page-list';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';

interface PagelistUpdateModalProps {
    isbn: string;
    onGenerate: (anchors: PageAnchor[]) => void;
    onClose: () => void;
}

type Status = 'idle' | 'busy' | 'error';

const PagelistUpdateModalComponent: React.FC<PagelistUpdateModalProps> = ({ isbn, onGenerate, onClose }) => {
    useBodyScrollLock();
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpdate = async () => {
        if (!file) return;
        setStatus('busy');
        setErrorMsg(null);
        try {
            await ebooksApi.uploadPrintPdf(isbn, file);
        } catch {
            setErrorMsg('Erro ao carregar o PDF.');
            setStatus('error');
            return;
        }
        let anchors: PageAnchor[];
        try {
            anchors = await extractPdfPageAnchors(await file.arrayBuffer());
        } catch {
            // O PDF já ficou gravado no servidor — só a extração das páginas falhou.
            setErrorMsg('PDF carregado, mas falhou o processamento das páginas. Tenta novamente.');
            setStatus('error');
            return;
        }
        onGenerate(anchors); // trata 0-âncoras e sucesso com os próprios toasts
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        <RefreshCw size={18} className="text-slate-500" />
                        Atualização Pagelist
                    </h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                <div className="p-6 flex flex-col gap-4">
                    <p className="text-sm text-text-muted">
                        Carrega o novo PDF de impressão. Este ficheiro substitui o atualmente guardado e a page-list é gerada de novo a partir dele.
                    </p>

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={status === 'busy'}
                        className="flex items-center gap-3 p-3 rounded-xl border border-border bg-slate-50/50 hover:border-slate-700 transition-colors text-left disabled:opacity-50"
                    >
                        <Upload size={16} className="text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-700 flex-1 truncate">
                            {file ? file.name : 'Escolher ficheiro PDF...'}
                        </span>
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf"
                        hidden
                        onChange={e => { setFile(e.target.files?.[0] ?? null); setStatus('idle'); setErrorMsg(null); }}
                    />

                    {status === 'error' && errorMsg && (
                        <p className="text-sm text-rose-500">{errorMsg}</p>
                    )}
                </div>

                <div className="p-6 bg-slate-50 border-t border-border flex gap-3">
                    <button
                        className="flex-1 py-3 border border-border text-slate-700 rounded-xl font-bold transition-all hover:bg-slate-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={status === 'busy'}
                        onClick={onClose}
                    >
                        Cancelar
                    </button>
                    <button
                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                        disabled={!file || status === 'busy'}
                        onClick={handleUpdate}
                    >
                        {status === 'busy' ? <><Loader2 size={16} className="animate-spin" /> A processar...</> : 'Atualizar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export const PagelistUpdateModal = React.memo(PagelistUpdateModalComponent);
