import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ebooksApi, type Comment } from '../../../api/ebooks-api';

export interface CommentThread {
    anchorId: string;
    root: Comment;
    replies: Comment[];
}

export function useComments(isbn: string | undefined) {
    const queryClient = useQueryClient();
    // anchor_id de uma thread ainda sem comentário nenhum (span acabado de criar no editor,
    // à espera do 1º texto — ver onAddComment em WorkEditor/setup.ts).
    const [draftAnchorId, setDraftAnchorId] = useState<string | null>(null);

    const { data: comments = [] } = useQuery({
        queryKey: ['ebook-comments', isbn],
        queryFn: () => ebooksApi.getComments(isbn!).then(r => r.data.comments),
        enabled: !!isbn,
    });

    const threads = useMemo<CommentThread[]>(() => {
        const byAnchor = new Map<string, Comment[]>();
        for (const c of comments) {
            if (!byAnchor.has(c.anchor_id)) byAnchor.set(c.anchor_id, []);
            byAnchor.get(c.anchor_id)!.push(c);
        }
        const out: CommentThread[] = [];
        for (const [anchorId, group] of byAnchor) {
            const root = group.find(c => c.parent_id === null);
            if (!root) continue;
            out.push({ anchorId, root, replies: group.filter(c => c.parent_id !== null) });
        }
        return out;
    }, [comments]);

    const unresolvedCount = threads.filter(t => !t.root.resolved).length;

    const invalidate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['ebook-comments', isbn] });
    }, [queryClient, isbn]);

    const addMutation = useMutation({
        mutationFn: ({ anchorId, text, parentId }: { anchorId: string; text: string; parentId?: number }) =>
            ebooksApi.addComment(isbn!, anchorId, text, parentId),
        onSuccess: invalidate,
    });

    const resolveMutation = useMutation({
        mutationFn: ({ id, resolved }: { id: number; resolved: boolean }) => ebooksApi.resolveComment(isbn!, id, resolved),
        onSuccess: invalidate,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => ebooksApi.deleteComment(isbn!, id),
        onSuccess: invalidate,
    });

    return {
        threads, unresolvedCount,
        draftAnchorId, setDraftAnchorId,
        addComment: addMutation.mutate,
        resolveComment: resolveMutation.mutate,
        deleteComment: deleteMutation.mutate,
    };
}
