import { useEffect, useState } from 'react';

export interface EditorFrame { top: number; bottom: number }

/**
 * Onde está o editor na janela, para os painéis de edição ficarem à mesma altura dele: `top` = topo do editor (nunca por
 * cima do cabeçalho) e `bottom` = distância do fundo dele ao fundo da janela. null enquanto o editor não existe (valem as
 * classes do painel). Atualiza com scroll, resize da janela e redimensionar do editor.
 */
export function useEditorFrame(): EditorFrame | null {
    const [frame, setFrame] = useState<EditorFrame | null>(null);
    useEffect(() => {
        const editor = document.querySelector<HTMLElement>('.tox-tinymce:not(.tox-tinymce-aux)');
        if (!editor) return;
        let raf = 0;
        const measure = () => {
            raf = 0;
            const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wp-header-h')) || 57;
            const rect = editor.getBoundingClientRect();
            const next = { top: Math.round(Math.max(rect.top, header)), bottom: Math.max(Math.round(window.innerHeight - rect.bottom), 0) };
            setFrame((prev) => (prev && prev.top === next.top && prev.bottom === next.bottom ? prev : next));
        };
        const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
        measure();
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        const ro = new ResizeObserver(schedule);
        ro.observe(editor);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
            ro.disconnect();
        };
    }, []);
    return frame;
}
