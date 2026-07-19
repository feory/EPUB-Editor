import React from 'react';
import { ImageIcon, FileUp } from 'lucide-react';
import { CoverCropEditor } from '../../components/CoverCropEditor';
import { ModalCloseButton } from '../../components/ModalCloseButton';
import type { Ebook } from '../../api/ebooks-api';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface CoverModalProps {
    isOpen: boolean;
    onClose: () => void;
    ebook: Ebook;
    coverUrl: string | null;
    cropImageUrl: string | null;
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onCropSave: (blob: Blob) => void;
    onCropCancel: () => void;
    onGenerateAutoCover: () => void;
}

export const CoverModal: React.FC<CoverModalProps> = ({
    isOpen, onClose, ebook, coverUrl, cropImageUrl,
    onFileUpload, onCropSave, onCropCancel, onGenerateAutoCover,
}) => {
    useBodyScrollLock(isOpen);
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !cropImageUrl && onClose()} />
            <div className={`relative bg-surface rounded-2xl shadow-2xl w-full overflow-hidden animate-in fade-in zoom-in duration-200 ${cropImageUrl ? 'max-w-xl' : 'max-w-md'}`}>
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-slate-700">
                        {cropImageUrl ? 'Ajuste de Capa' : `Capa: ${ebook.title}`}
                    </h2>
                    <ModalCloseButton onClick={() => cropImageUrl ? onCropCancel() : onClose()} />
                </div>

                <div className="p-8 flex flex-col items-center gap-8">
                    {cropImageUrl ? (
                        <CoverCropEditor imageUrl={cropImageUrl} onSave={onCropSave} onCancel={onCropCancel} />
                    ) : (
                        <>
                            <div className="cover-preview-large">
                                {coverUrl ? (
                                    <img src={coverUrl} alt="Capa" loading="lazy" className="animate-in fade-in duration-500" />
                                ) : (
                                    <div className="cover-placeholder text-slate-200">
                                        <ImageIcon size={64} className="text-slate-200" />
                                        <span className="text-sm font-medium">Sem capa definida</span>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <label className="inline-flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer shadow-sm active:scale-95">
                                    <FileUp size={18} />
                                    <span>Upload</span>
                                    <input type="file" accept="image/*,.pdf,application/pdf" onChange={onFileUpload} hidden />
                                </label>
                                <button
                                    className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-text-main px-4 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
                                    onClick={onGenerateAutoCover}
                                >
                                    <ImageIcon size={18} />
                                    <span>Gerar Auto</span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
