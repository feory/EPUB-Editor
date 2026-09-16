import React, { useState } from 'react';
import { Check, X, RotateCcw, Square } from 'lucide-react';
import { ModalCloseButton } from '../../../components/ModalCloseButton';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { parseBoxStyle, applyBoxStyle, type BoxStyle } from '../editor/boxStyle';

interface BoxStyleModalProps {
    css: string;
    onSave: (newCss: string) => void;
    onCancel: () => void;
}

export const BoxStyleModal: React.FC<BoxStyleModalProps> = ({ css, onSave, onCancel }) => {
    useBodyScrollLock();
    const [style, setStyle] = useState<BoxStyle>(() => parseBoxStyle(css));

    const update = (patch: Partial<BoxStyle>) => setStyle(prev => ({ ...prev, ...patch }));

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        <Square
                            size={18}
                            style={{
                                color: style.borderWidth > 0 ? style.borderColor || '#000000' : undefined,
                                fill: style.backgroundColor || 'none',
                            }}
                            className={style.borderWidth > 0 ? '' : 'text-slate-400'}
                        />
                        Edição da Caixa
                    </h2>
                    <ModalCloseButton onClick={onCancel} />
                </div>

                <div className="p-6 flex flex-col gap-4">
                    <div
                        className="rounded-lg p-4 text-sm text-slate-700 leading-relaxed transition-all"
                        style={{
                            backgroundColor: style.backgroundColor || 'transparent',
                            border: style.borderWidth > 0 ? `${style.borderWidth}px solid ${style.borderColor || '#000000'}` : '1px dashed #cbd5e1',
                        }}
                    >
                        Texto de exemplo dentro da caixa.
                    </div>

                    <label className="flex items-center justify-between text-sm font-medium text-text-main">
                        <span>Cor de fundo</span>
                        <span className="flex items-center gap-2">
                            <input
                                type="color"
                                value={style.backgroundColor || '#ffffff'}
                                onChange={e => update({ backgroundColor: e.target.value })}
                                className="w-9 h-9 rounded-lg cursor-pointer border border-border p-0.5"
                            />
                            <button
                                type="button"
                                onClick={() => update({ backgroundColor: '' })}
                                title="Remover fundo"
                                disabled={!style.backgroundColor}
                                className="w-3.5 text-text-muted hover:text-text-main disabled:invisible"
                            >
                                <X size={14} />
                            </button>
                        </span>
                    </label>

                    <label className="flex items-center justify-between text-sm font-medium text-text-main">
                        <span>Cor do contorno</span>
                        <span className="flex items-center gap-2">
                            <input
                                type="color"
                                value={style.borderColor || '#000000'}
                                onChange={e => update({ borderColor: e.target.value, borderWidth: style.borderWidth || 2 })}
                                className="w-9 h-9 rounded-lg cursor-pointer border border-border p-0.5"
                            />
                            <span className="w-3.5" />
                        </span>
                    </label>

                    <label className="flex items-center justify-between text-sm font-medium text-text-main">
                        <span>Espessura do contorno</span>
                        <span className="flex items-center gap-2">
                            <input
                                type="number"
                                min={0}
                                max={10}
                                value={style.borderWidth}
                                onChange={e => update({ borderWidth: Number(e.target.value) })}
                                className="w-16 h-9 rounded-lg border border-border px-2 text-sm outline-none focus:border-primary"
                            />
                            <span className="w-3.5" />
                        </span>
                    </label>
                </div>

                <div className="flex items-center justify-between gap-3 p-6 border-t border-border">
                    <button
                        type="button"
                        onClick={() => setStyle(parseBoxStyle(css))}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-muted hover:bg-slate-50 transition-colors"
                    >
                        <RotateCcw size={16} />
                        <span>Repor</span>
                    </button>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-bold text-text-muted hover:bg-slate-50 transition-colors"
                        >
                            <X size={16} />
                            <span>Cancelar</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onSave(applyBoxStyle(css, style))}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition-colors"
                        >
                            <Check size={16} />
                            <span>Guardar</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
