import React, { useState } from 'react';
import { Type, Save } from 'lucide-react';
import { EDITOR_FONTS, EDITOR_FONT_SIZES } from '../utils/editorFonts';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';

interface FontModalProps {
    value: string;
    onChange: (id: string) => void;
    sizeValue: string;
    onChangeSize: (id: string) => void;
    onClose: () => void;
}

const PREVIEW = 'Aa Bb Cc — O voo do flamingo ao amanhecer. 0123456789';

const FontModalComponent: React.FC<FontModalProps> = ({ value, onChange, sizeValue, onChangeSize, onClose }) => {
    useBodyScrollLock();
    // Rascunho local — só aplica ao editor após confirmação
    const [draft, setDraft] = useState(value);
    const [draftSize, setDraftSize] = useState(sizeValue);
    const font = EDITOR_FONTS.find(f => f.id === draft) ?? EDITOR_FONTS[0];
    const size = EDITOR_FONT_SIZES.find(s => s.id === draftSize) ?? EDITOR_FONT_SIZES[0];
    // 'default' (Crimson) usa o stack do próprio livro; tamanho default = base do editor (1.1em)
    const previewFamily = font.stack || '"Crimson Text", Georgia, serif';
    const previewSize = size.value || '1.1em';

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-lg h-[80vh] overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                        <Type size={20} className="text-slate-500" />
                        Fonte do Editor
                    </h2>
                    <div className="flex items-center gap-1">
                        <button
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all"
                            onClick={() => { onChange(draft); onChangeSize(draftSize); onClose(); }}
                            title="Aplicar"
                        >
                            <Save size={20} />
                        </button>
                        <ModalCloseButton onClick={onClose} />
                    </div>
                </div>

                <div className="p-6 space-y-5 flex-1 flex flex-col min-h-0">
                    <div className="flex gap-3">
                        <label className="flex-1 flex flex-col gap-1.5">
                            <span className="text-xs font-black text-text-muted uppercase tracking-widest">Tipo de letra</span>
                            <select
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                className="w-full text-sm text-slate-700 bg-white border border-border rounded-xl px-3 h-11 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-300"
                            >
                                {EDITOR_FONTS.map(f => (
                                    <option key={f.id} value={f.id}>{f.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="w-44 flex flex-col gap-1.5">
                            <span className="text-xs font-black text-text-muted uppercase tracking-widest">Tamanho</span>
                            <select
                                value={draftSize}
                                onChange={(e) => setDraftSize(e.target.value)}
                                className="w-full text-sm text-slate-700 bg-white border border-border rounded-xl px-3 h-11 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-300"
                            >
                                {EDITOR_FONT_SIZES.map(s => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="border border-border rounded-xl p-5 bg-white flex-1 min-h-0 overflow-auto">
                        <div className="text-xs font-black text-text-muted uppercase tracking-widest mb-3">Pré-visualização</div>
                        <div style={{ fontFamily: previewFamily, fontSize: previewSize }}>
                            <p className="text-text-main mb-2" style={{ fontSize: '1.5em', lineHeight: 1.2 }}>{PREVIEW}</p>
                            <p className="text-text-main" style={{ lineHeight: 1.6 }}>
                                <strong>Negrito</strong> · <em>Itálico</em> · texto normal de corpo para avaliar a legibilidade em leitura contínua.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const FontModal = React.memo(FontModalComponent);
