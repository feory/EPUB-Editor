import React, { useCallback } from 'react';

interface PanelResizeHandleProps {
    width: number;
    onResize: (width: number) => void;
    min?: number;
    max?: number;
}

// Pega na borda esquerda dos painéis fixos à direita (PDF, Galeria, Validações, Diff,
// Gramática) — arrastar aumenta/diminui a largura partilhada por todos (mesmas dimensões).
export const PanelResizeHandle: React.FC<PanelResizeHandleProps> = ({ width, onResize, min = 400, max = 1400 }) => {
    const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        const handle = e.currentTarget;
        // Pointer capture: garante que pointermove/pointerup continuam a chegar a ESTE
        // elemento mesmo com o rato sobre o iframe do editor (documento diferente — um
        // mouseup lá dentro nunca chegaria a um listener na window, o arrasto ficava
        // "preso" e qualquer movimento seguinte continuava a redimensionar sem o botão).
        handle.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startWidth = width;

        const onMove = (ev: PointerEvent) => {
            if (ev.buttons === 0) { stop(); return; } // botão já largado — não devia estar a arrastar
            onResize(Math.min(max, Math.max(min, startWidth + (startX - ev.clientX))));
        };
        const stop = () => {
            handle.releasePointerCapture(e.pointerId);
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', stop);
            handle.removeEventListener('pointercancel', stop);
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
    }, [width, onResize, min, max]);

    return (
        <div
            onPointerDown={onPointerDown}
            className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/40 z-10"
        />
    );
};
