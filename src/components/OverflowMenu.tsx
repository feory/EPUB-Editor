import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

interface OverflowMenuItem {
    icon: React.ReactNode;
    label: string;
    onClick: (e: React.MouseEvent) => void;
}

interface OverflowMenuProps {
    items: OverflowMenuItem[];
    buttonClassName?: string;
    iconSize?: number;
    direction?: 'auto' | 'up' | 'down';
}

const MENU_HEIGHT_ESTIMATE = 40; // px por item, aproximado — só para decidir abrir para cima/baixo

// Portal para <body>: escapa de qualquer ancestral com overflow-x-auto (que por spec CSS força
// o overflow-y a comportar-se como auto/clip também, mesmo com overflow-y-visible explícito).
export const OverflowMenu: React.FC<OverflowMenuProps> = ({ items, buttonClassName, iconSize = 15, direction = 'auto' }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
            setOpen(false);
        };
        const onScroll = () => setOpen(false);
        document.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [open]);

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            const menuHeight = items.length * MENU_HEIGHT_ESTIMATE;
            const right = window.innerWidth - rect.right;
            const openUp = direction === 'up' || (direction === 'auto' && window.innerHeight - rect.bottom < menuHeight && rect.top > menuHeight);
            if (openUp) {
                setPos({ bottom: window.innerHeight - rect.top + 4, right });
            } else {
                setPos({ top: rect.bottom + 4, right });
            }
        }
        setOpen(o => !o);
    };

    return (
        <>
            <button
                ref={btnRef}
                onClick={toggle}
                title="Mais ações"
                className={buttonClassName ?? 'p-2 rounded-lg border border-border text-text-muted hover:border-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all'}
            >
                <MoreHorizontal size={iconSize} />
            </button>
            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, right: pos.right }}
                    className="w-44 bg-white border border-border rounded-xl shadow-xl py-1 z-[1000] animate-in fade-in duration-150"
                    onClick={e => e.stopPropagation()}
                >
                    {items.map((item, i) => (
                        <button
                            key={i}
                            onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(e); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                            {item.icon} {item.label}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
};
