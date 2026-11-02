import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { WorkEditorRef } from '../components/WorkEditor';

/** Onde ficou o cursor: capítulo (-1 = livro inteiro) e N-ésimo parágrafo não vazio desse capítulo. */
export interface ResumePosition { chapter: number; paragraph: number }

const keyOf = (userId: number | string, isbn: string) => `epub-resume:${userId}:${isbn}`;

export function readResume(userId: number | string, isbn: string): ResumePosition | null {
    try {
        const p = JSON.parse(localStorage.getItem(keyOf(userId, isbn)) ?? 'null');
        return p && Number.isInteger(p.chapter) && Number.isInteger(p.paragraph) ? p : null;
    } catch { return null; }
}

const writeResume = (userId: number | string, isbn: string, p: ResumePosition) => {
    try { localStorage.setItem(keyOf(userId, isbn), JSON.stringify(p)); } catch { /* sem armazenamento: não lembra */ }
};

/**
 * "Continuar onde ficaste": guarda no browser, por utilizador e ebook, o capítulo e o parágrafo do cursor. Ao abrir o
 * editor com conteúdo pronto, `pending` traz a posição guardada (para a modal perguntar); só depois de `resume`/`dismiss`
 * se volta a gravar — senão o cursor inicial (início do livro) apagava a posição antes da escolha.
 */
export function useResumePosition(opts: {
    isbn: string | undefined; userId: number | string | undefined; editorRef: RefObject<WorkEditorRef | null>;
    ready: boolean; chapterCount: number; activeChapterIndex: number; setActiveChapterIndex: (i: number) => void;
}) {
    const { isbn, userId, editorRef, ready, chapterCount, activeChapterIndex, setActiveChapterIndex } = opts;
    const [pending, setPending] = useState<ResumePosition | null>(null);
    const [tracking, setTracking] = useState(false);
    const [asked, setAsked] = useState(false);
    const activeRef = useRef(activeChapterIndex);
    useEffect(() => { activeRef.current = activeChapterIndex; });

    // Uma só vez, quando o conteúdo fica pronto (ajuste de estado durante o render, não num efeito).
    if (ready && !asked && isbn && userId != null) {
        const saved = readResume(userId, isbn);
        const valid = !!saved && saved.chapter < chapterCount && (saved.chapter !== 0 || saved.paragraph > 0);
        setAsked(true);
        setPending(valid ? saved : null);
        setTracking(!valid);
    }

    useEffect(() => {
        if (!tracking || !isbn || userId == null) return;
        const save = () => {
            const paragraph = editorRef.current?.cursorParagraph();
            if (paragraph != null) writeResume(userId, isbn, { chapter: activeRef.current, paragraph });
        };
        const timer = setInterval(save, 5000);
        window.addEventListener('pagehide', save);
        return () => { clearInterval(timer); window.removeEventListener('pagehide', save); save(); };
    }, [tracking, isbn, userId, editorRef]);

    const resume = () => {
        const p = pending;
        setPending(null);
        setTracking(true);
        if (!p) return;
        const go = () => editorRef.current?.scrollToParagraph(p.paragraph, true);
        if (p.chapter === activeRef.current) go();
        else { editorRef.current?.afterChapterChange(go); setActiveChapterIndex(p.chapter); }
    };
    const dismiss = () => {
        if (isbn && userId != null) { try { localStorage.removeItem(keyOf(userId, isbn)); } catch { /* sem armazenamento */ } }
        setPending(null);
        setTracking(true);
    };

    return { pending, resume, dismiss };
}
