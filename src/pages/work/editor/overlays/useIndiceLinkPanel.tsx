import { useState } from 'react';
import type { TinyMCEEditor } from '../types';
import { useLive } from '../liveProps';
import { IndiceLinkPanel, type IndiceLinkChapter, type IndiceLinkSubtitle } from './IndiceLinkPanel';
import { miniMenuAnchor } from './popupDismiss';

interface Options {
    chapters: IndiceLinkChapter[];
    activeChapterIndex: number;
    getSubtitles?: () => IndiceLinkSubtitle[];
    onLink?: (pIndex: number, indiceChapterIndex: number, targetChapterIndex: number | null, subIndex?: number) => void; // null = remover ligação
}

/**
 * Estado do painel "Ligar a…" do Índice. `open` é chamado pelo botão do Mini-menu (o setup do TinyMCE corre uma
 * só vez, por isso `open` não pode depender de props: lê os subtítulos NA HORA, via ref); `element` é o painel a
 * montar. Muda o capítulo aberto → fecha (o `pIndex` guardado deixa de valer).
 */
export function useIndiceLinkPanel(editorRef: React.MutableRefObject<TinyMCEEditor | null>, { chapters, activeChapterIndex, getSubtitles, onLink }: Options) {
    const [state, setState] = useState<{ top: number; left: number; pIndex: number; currentTarget: string; subtitles: IndiceLinkSubtitle[]; chapter: number } | null>(null);
    const live = useLive({ getSubtitles, activeChapterIndex });
    if (state && state.chapter !== activeChapterIndex) setState(null);
    const close = () => setState(null);
    const open = (pIndex: number, currentTarget: string) =>
        setState({ ...miniMenuAnchor(), pIndex, currentTarget, subtitles: live.current.getSubtitles?.() ?? [], chapter: live.current.activeChapterIndex });
    const element = state && (
        <IndiceLinkPanel
            {...state}
            editorRef={editorRef}
            chapters={chapters}
            ownIndex={activeChapterIndex}
            onPick={(target, sub) => { onLink?.(state.pIndex, activeChapterIndex, target, sub); close(); }}
            onClose={close}
        />
    );
    return { open, element };
}
