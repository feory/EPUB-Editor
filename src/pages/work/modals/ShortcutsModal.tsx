import React from 'react';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock';
import { ModalCloseButton } from '../../../components/ModalCloseButton';

interface ShortcutsModalProps {
    onClose: () => void;
}

const ShortcutsModalComponent: React.FC<ShortcutsModalProps> = ({ onClose }) => {
    useBodyScrollLock();
    const shortcuts = [
        { group: 'Edição Comum', items: [
            { keys: ['Ctrl', 'B'], desc: 'Negrito' },
            { keys: ['Ctrl', 'I'], desc: 'Itálico' },
            { keys: ['Ctrl', 'U'], desc: 'Sublinhado' },
            { keys: ['Ctrl', 'Z'], desc: 'Desfazer' },
            { keys: ['Ctrl', 'Y'], desc: 'Refazer' },
        ]},
        { group: 'Ações de Sistema', items: [
            { keys: ['Ctrl', 'S'], desc: 'Guardar trabalho manualmente' },
            { keys: ['Ctrl', 'E'], desc: 'Exportar ficheiro EPUB' },
            { keys: ['Ctrl', 'Shift', 'F'], desc: 'Modo Foco' },
        ]},
        { group: 'Formatação de Parágrafos', items: [
            { keys: ['Ctrl', 'P'], desc: 'Parágrafo Padrão' },
            { keys: ['Ctrl', 'I'], desc: 'Parágrafo identado' },
            { keys: ['Ctrl', 'T'], desc: 'Parágrafo de Topo (espaço extra)' },
        ]},
        { group: 'Formatação de Capítulos', items: [
            { keys: ['Ctrl', '1'], desc: 'Título Principal (H1)' },
            { keys: ['Ctrl', '2'], desc: 'Título de Capítulo (H2)' },
            { keys: ['Ctrl', '3'], desc: 'Subtítulo (H3)' },
        ]}
    ];

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdKey = isMac ? '⌘' : 'Ctrl';

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-border bg-slate-50/50">
                    <h2 className="text-xl font-bold text-slate-700">
                        Atalhos de Teclado
                    </h2>
                    <ModalCloseButton onClick={onClose} />
                </div>

                <div className="p-6 pb-10 grid grid-cols-2 gap-6 overflow-y-auto max-h-[60vh]">
                    {shortcuts.map((group, i) => (
                        <div key={i} className="space-y-3">
                            <h3 className="text-xs font-black text-text-muted uppercase tracking-widest">{group.group}</h3>
                            <div className="space-y-2">
                                {group.items.map((item, j) => (
                                    <div key={j} className="flex justify-between items-center group">
                                        <span className="text-sm text-text-main font-medium">{item.desc}</span>
                                        <div className="flex gap-1">
                                            {item.keys.map((key, k) => (
                                                <kbd key={k} className="min-w-[2.5rem] h-6 flex items-center justify-center px-1.5 rounded border border-border bg-slate-50 text-[10px] font-bold shadow-sm">
                                                    {key === 'Ctrl' ? cmdKey : key}
                                                </kbd>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>


            </div>
        </div>
    );
};

export const ShortcutsModal = React.memo(ShortcutsModalComponent);
