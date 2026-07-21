import React from 'react';
import { Loader2 } from 'lucide-react';
import { CoverCropEditor } from '../../../../components/CoverCropEditor';
import { ModalCloseButton } from '../../../../components/ModalCloseButton';
import { useBodyScrollLock } from '../../../../hooks/useBodyScrollLock';

interface ImageCropModalProps {
    imageId: string;
    imageUrl: string;
    onSave: (blob: Blob) => void;
    onCancel: () => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({ imageId, imageUrl, onSave, onCancel }) => {
    useBodyScrollLock();
    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2 font-mono">{imageId}</h2>
                    <ModalCloseButton onClick={onCancel} />
                </div>
                <div className="p-8">
                    {imageUrl ? (
                        <CoverCropEditor imageUrl={imageUrl} onSave={onSave} onCancel={onCancel} label="Ajuste a área de corte" />
                    ) : (
                        <div className="flex items-center justify-center min-h-[300px]">
                            <Loader2 size={32} className="animate-spin text-slate-400" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
