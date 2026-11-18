import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ebooksApi } from '../../../api/ebooks-api';
import { ModalCloseButton } from '../../../components/ModalCloseButton';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';

type Result = Awaited<ReturnType<typeof ebooksApi.compressImages>>['data'];
const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

interface Props { isbn: string; onClose: () => void; /** Atualiza a galeria depois de comprimir. */ onDone: () => void }

const CompressImagesModalComponent: React.FC<Props> = ({ isbn, onClose, onDone }) => {
    useBodyScrollLock();
    const [maxWidth, setMaxWidth] = useState(1600);
    const [quality, setQuality] = useState(82);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<Result | null>(null);
    const [error, setError] = useState('');

    const run = async () => {
        setBusy(true); setError('');
        try {
            setResult((await ebooksApi.compressImages(isbn, { maxWidth, quality })).data);
            onDone();
        } catch {
            setError('Não foi possível comprimir as imagens (largura entre 400 e 6000, qualidade entre 40 e 95).');
        } finally { setBusy(false); }
    };

    const field = 'w-full px-3 py-2 rounded-xl border border-border bg-white text-sm';
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-700">Compressão de Imagens</h2>
                    <ModalCloseButton onClick={onClose} />
                </div>
                <div className="p-6 space-y-4 text-sm text-slate-700">
                    <p>Reduz as imagens mais largas do que o máximo e recodifica PNG, JPEG e WebP. Os nomes mantêm-se, por isso o livro não muda.</p>
                    <label className="block space-y-1">
                        <span className="font-bold">Largura máxima (px)</span>
                        <input type="number" min={400} max={6000} className={field} value={maxWidth} disabled={busy} onChange={(e) => setMaxWidth(Number(e.target.value))} />
                    </label>
                    <label className="block space-y-1">
                        <span className="font-bold">Qualidade JPEG/WebP (40–95)</span>
                        <input type="number" min={40} max={95} className={field} value={quality} disabled={busy} onChange={(e) => setQuality(Number(e.target.value))} />
                    </label>
                    <p className="text-xs font-bold text-red-700">Substitui as imagens no servidor e não se pode desfazer.</p>
                    {error && <p className="text-xs text-red-700">{error}</p>}
                    {result && (
                        <p className="p-3 rounded-xl bg-slate-50 border border-border">
                            {result.compressed} de {result.total} imagens comprimidas: {mb(result.before)} → {mb(result.after)}
                            {result.before ? ` (−${Math.round((1 - result.after / result.before) * 100)}%)` : ''}.
                        </p>
                    )}
                </div>
                <div className="p-6 bg-slate-50 border-t border-border flex gap-3">
                    <button className="flex-1 py-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2" onClick={run} disabled={busy}>
                        {busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'A comprimir…' : 'Comprimir'}
                    </button>
                    <button className="px-6 py-3 rounded-xl font-bold border border-border text-slate-700 hover:bg-slate-100 disabled:opacity-50" onClick={onClose} disabled={busy}>Fechar</button>
                </div>
            </div>
        </div>
    );
};

export const CompressImagesModal = React.memo(CompressImagesModalComponent);
