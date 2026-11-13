import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { ebooksApi, type AiChange } from '../../../api/ebooks-api';

/** O registo das alterações da IA no livro (mais recentes primeiro) e o Reverter. `revert` repõe o livro; devolve se conseguiu. */
export function useAiChanges({ isbn, enabled, revert }: { isbn: string | undefined; enabled: boolean; revert: (change: AiChange) => Promise<boolean> }) {
    const queryClient = useQueryClient();
    const [busyId, setBusyId] = useState<string | null>(null);
    const { data, isLoading, isError } = useQuery({
        queryKey: ['ai-changes', isbn],
        queryFn: () => ebooksApi.listAiChanges(isbn!),
        enabled: !!isbn && enabled, // só pede quando a vista está aberta
    });
    const revertChange = useCallback(async (change: AiChange) => {
        setBusyId(change.id);
        const ok = await revert(change);
        if (ok) await queryClient.invalidateQueries({ queryKey: ['ai-changes', isbn] });
        setBusyId(null);
        return ok;
    }, [revert, queryClient, isbn]);
    return { changes: data ?? [], isLoading, isError, busyId, revertChange };
}
