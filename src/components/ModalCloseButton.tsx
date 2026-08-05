import React from 'react';
import { X } from 'lucide-react';

interface ModalCloseButtonProps {
    onClick: () => void;
    className?: string;
}

export const ModalCloseButton: React.FC<ModalCloseButtonProps> = ({ onClick, className = '' }) => (
    <button
        aria-label="Fechar"
        className={`p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-all ${className}`}
        onClick={onClick}
    >
        <X size={20} />
    </button>
);
