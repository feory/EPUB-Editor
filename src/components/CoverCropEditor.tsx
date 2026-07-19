import { useState, useRef, useEffect } from 'react';
import ReactCrop, { type Crop } from 'react-image-crop';
import { Crop as CropIcon, Check, X, RotateCcw } from 'lucide-react';
import 'react-image-crop/dist/ReactCrop.css';

interface CoverCropEditorProps {
    imageUrl: string;
    onSave: (croppedBlob: Blob) => void;
    onCancel: () => void;
}

function createInitialCrop(_mediaWidth: number, _mediaHeight: number): Crop {
    return { unit: '%', x: 0, y: 0, width: 100, height: 100 };
}

export function CoverCropEditor({ imageUrl, onSave, onCancel }: CoverCropEditorProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<Crop>();
    const [isProcessing, setIsProcessing] = useState(false);

    function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
        const { width, height } = e.currentTarget;
        setCrop(createInitialCrop(width, height));
    }

    const resetCrop = () => {
        if (imgRef.current) {
            const { width, height } = imgRef.current;
            setCrop(createInitialCrop(width, height));
        }
    };

    const handleSave = async () => {
        if (!completedCrop || !imgRef.current) return;

        setIsProcessing(true);

        try {
            const image = imgRef.current;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Convert crop to natural image pixels
            const scaleX = image.naturalWidth / image.width;
            const scaleY = image.naturalHeight / image.height;

            const isPercent = completedCrop.unit === '%';
            const pixelCrop = isPercent
                ? {
                    x: (completedCrop.x / 100) * image.naturalWidth,
                    y: (completedCrop.y / 100) * image.naturalHeight,
                    width: (completedCrop.width / 100) * image.naturalWidth,
                    height: (completedCrop.height / 100) * image.naturalHeight,
                }
                : {
                    x: completedCrop.x * scaleX,
                    y: completedCrop.y * scaleY,
                    width: completedCrop.width * scaleX,
                    height: completedCrop.height * scaleY,
                };

            // Use actual crop dimensions (max 1200px width for reasonable file size)
            const maxWidth = 1400;
            let outputWidth = pixelCrop.width;
            let outputHeight = pixelCrop.height;

            if (outputWidth > maxWidth) {
                const ratio = maxWidth / outputWidth;
                outputWidth = maxWidth;
                outputHeight = outputHeight * ratio;
            }

            canvas.width = outputWidth;
            canvas.height = outputHeight;

            // Draw cropped area to canvas
            ctx.drawImage(
                image,
                pixelCrop.x,
                pixelCrop.y,
                pixelCrop.width,
                pixelCrop.height,
                0,
                0,
                outputWidth,
                outputHeight
            );

            // Convert to blob
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        onSave(blob);
                    }
                    setIsProcessing(false);
                },
                'image/jpeg',
                0.92
            );
        } catch (error) {
            console.error('Error cropping image:', error);
            setIsProcessing(false);
        }
    };

    // Update completedCrop when crop changes
    useEffect(() => {
        if (crop) {
            setCompletedCrop(crop);
        }
    }, [crop]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm text-text-muted">
                <CropIcon size={16} />
                <span>Ajuste a area de corte para a capa</span>
            </div>

            <div className="relative bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center p-4 min-h-[300px]">
                <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(_, percentCrop) => setCompletedCrop(percentCrop)}
                    className="max-h-[380px]"
                >
                    <img
                        ref={imgRef}
                        src={imageUrl}
                        alt="Crop preview"
                        onLoad={onImageLoad}
                        className="max-h-[380px] max-w-full object-contain"
                        crossOrigin="anonymous"
                    />
                </ReactCrop>
            </div>

            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-slate-50 transition-colors"
                    onClick={resetCrop}
                >
                    <RotateCcw size={16} />
                    <span>Repor</span>
                </button>

                <div className="flex gap-2">
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-bold text-text-muted hover:bg-slate-50 transition-colors"
                        onClick={onCancel}
                        disabled={isProcessing}
                    >
                        <X size={16} />
                        <span>Cancelar</span>
                    </button>
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition-colors disabled:opacity-50"
                        onClick={handleSave}
                        disabled={isProcessing || !completedCrop}
                    >
                        <Check size={16} />
                        <span>{isProcessing ? 'A processar...' : 'Aplicar Corte'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
