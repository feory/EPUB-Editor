import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { WorkEditorRef } from '../components/WorkEditor';
import type { CommentThread, useComments } from './useComments';
import { useGoToChapterMarker } from './useGoToChapterMarker';

export interface CommentThreadView extends CommentThread {
    // Span âncora já não existe no HTML do livro (apagado à mão no editor) — thread fica
    // sem alvo, mas continua na BD. Ver "orphan comment" no CONTEXT.md.
    orphan: boolean;
}

type CommentsApi = Pick<ReturnType<typeof useComments>, 'threads' | 'resolveComment' | 'deleteComment' | 'draftAnchorId' | 'setDraftAnchorId'>;

interface UseCommentEditorSyncDeps extends CommentsApi {
    editorRef: RefObject<WorkEditorRef | null>;
    fullHtmlContent: string;
    activeChapterIndex: number;
    setActiveChapterIndex: (index: number) => void;
    saveContentSilently: () => void;
    // Tira a âncora do HTML do livro inteiro (capítulo não montado no editor).
    removeAnchorFromBook: (anchorId: string) => void;
    // Painel de comentários aberto: com ele fechado não há onde escrever o rascunho.
    commentsOpen: boolean;
}

/**
 * Seam entre o estado de comentários (useComments, servidor) e o editor (WorkEditorRef,
 * DOM do TinyMCE) — o único lugar que precisa de conhecer os dois ao mesmo tempo.
 * Devolve threads já anotadas com `orphan`, navegação entre capítulos, e resolver/apagar
 * já a sincronizar a marcação visual no span e a persistência quando aplicável.
 */
export function useCommentEditorSync({
    editorRef, threads, resolveComment, deleteComment, draftAnchorId, setDraftAnchorId, commentsOpen,
    fullHtmlContent, activeChapterIndex, setActiveChapterIndex, saveContentSilently, removeAnchorFromBook,
}: UseCommentEditorSyncDeps) {
    const goTo = useGoToChapterMarker<string>(
        editorRef, fullHtmlContent, activeChapterIndex, setActiveChapterIndex,
        (anchorId) => `data-comment-id="${anchorId}"`,
        (editor, anchorId) => editor.scrollToComment(anchorId),
    );

    // 1 scan do HTML do livro por mudança de conteúdo, em vez de um .includes() por thread
    // renderizada a cada render da sidebar.
    const anchorIdsInDoc = useMemo(() => {
        const ids = new Set<string>();
        for (const m of fullHtmlContent.matchAll(/data-comment-id="([^"]+)"/g)) ids.add(m[1]);
        return ids;
    }, [fullHtmlContent]);

    const viewThreads = useMemo<CommentThreadView[]>(
        () => threads.map(t => ({ ...t, orphan: !anchorIdsInDoc.has(t.anchorId) })),
        [threads, anchorIdsInDoc],
    );

    // Classe "dimmed" do span é só visual (não persiste no HTML). O caminho rápido é o
    // onSuccess de `resolve` abaixo (só a thread alterada); isto aqui é a rede de segurança —
    // load inicial (threads chegam depois do 1º render) e troca de capítulo (remonta o DOM).
    useEffect(() => {
        threads.forEach(t => editorRef.current?.setCommentResolved(t.anchorId, !!t.root.resolved));
    }, [threads, activeChapterIndex, editorRef]);

    const resolve = useCallback((id: number, resolved: boolean) => {
        const anchorId = threads.find(t => t.root.id === id)?.anchorId;
        resolveComment({ id, resolved }, {
            onSuccess: () => { if (anchorId) editorRef.current?.setCommentResolved(anchorId, resolved); },
        });
    }, [threads, resolveComment, editorRef]);

    // Tira a âncora do texto: do DOM se o capítulo está montado, senão do HTML do livro.
    const dropAnchor = useCallback((anchorId: string) => {
        if (editorRef.current?.removeCommentAnchor(anchorId)) saveContentSilently();
        else removeAnchorFromBook(anchorId);
    }, [editorRef, saveContentSilently, removeAnchorFromBook]);

    // Rascunho: a âncora já está no texto (sublinhado) mas o comentário ainda não foi escrito.
    // Sem comentário escrito não pode ficar sublinhado → cancelar, fechar o painel ou começar
    // outro rascunho tira a âncora; só "Comentar" a mantém.
    const cancelDraft = useCallback(() => {
        if (draftAnchorId) dropAnchor(draftAnchorId);
        setDraftAnchorId(null);
    }, [draftAnchorId, dropAnchor, setDraftAnchorId]);

    // O botão "Comentar" do editor é ligado UMA vez no init do TinyMCE, por isso o callback que lhe
    // damos tem de ser estável — lê o rascunho e dropAnchor mais recentes por ref.
    const latest = useRef({ draftAnchorId, dropAnchor, setDraftAnchorId });
    useEffect(() => { latest.current = { draftAnchorId, dropAnchor, setDraftAnchorId }; });
    const startDraft = useCallback((anchorId: string) => {
        const { draftAnchorId: prev, dropAnchor: drop, setDraftAnchorId: setDraft } = latest.current;
        if (prev && prev !== anchorId) drop(prev);
        setDraft(anchorId);
    }, []);

    const cancelDraftRef = useRef(cancelDraft);
    useEffect(() => { cancelDraftRef.current = cancelDraft; });
    useEffect(() => {
        if (!commentsOpen && draftAnchorId) cancelDraftRef.current();
    }, [commentsOpen, draftAnchorId]);

    const remove = useCallback((id: number) => {
        // Apagar a raiz apaga a thread toda (backend) — desembrulha o span também, senão a
        // marcação amarela fica no texto sem comentário nenhum por trás. Grava já a seguir
        // (silencioso — não é o botão "Guardar"): sem isto a remoção só existe em memória e
        // um refresh sem "Guardar" à mão repunha o span (comentário já apagado da BD, mas o
        // texto continuava marcado).
        const thread = threads.find(t => t.root.id === id);
        deleteComment(id);
        if (!thread) return; // resposta (não tem âncora própria)
        // Capítulo montado no editor: desembrulha no DOM. Senão (âncora noutro capítulo) tira-a do
        // HTML do livro — sem isto a marcação voltava a aparecer ao abrir esse capítulo.
        dropAnchor(thread.anchorId);
    }, [threads, deleteComment, dropAnchor]);

    return { threads: viewThreads, goTo, resolve, remove, startDraft, cancelDraft };
}
