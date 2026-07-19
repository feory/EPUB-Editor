import React from 'react';
import { X } from 'lucide-react';
import { formatFileSize } from '../../../../utils/format';
import type { ImageData } from './useImageGallery';

interface ImageLightboxProps {
    image: ImageData;
    isbn: string;
    onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ image, isbn, onClose }) => (
    <div
        className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8 animate-in fade-in duration-200"
        onClick={onClose}
    >
        <button
            onClick={onClose}
            className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
        >
            <X size={24} />
        </button>

        <div className="max-w-6xl max-h-full flex flex-col items-center gap-4">
            <img
                src={`/api/ebooks/${isbn}/images/${image.id}`}
                alt={image.id}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            />

            <div className="bg-white/10 backdrop-blur-sm px-6 py-3 rounded-full text-white text-sm">
                <div className="flex items-center gap-4">
                    <span className="font-mono">{image.id}</span>
                    {image.dimensions && (
                        <>
                            <span className="text-white/50">•</span>
                            <span>{image.dimensions.width} × {image.dimensions.height}</span>
                        </>
                    )}
                    {image.size && (
                        <>
                            <span className="text-white/50">•</span>
                            <span>{formatFileSize(image.size)}</span>
                        </>
                    )}
                    {image.usageCount > 0 && (
                        <>
                            <span className="text-white/50">•</span>
                            <span>Usado {image.usageCount}×</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    </div>
);
