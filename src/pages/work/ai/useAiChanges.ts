import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { ebooksApi, type AiChange } from '../../../api/ebooks-api';

/** O registo das alterações da IA no livro (mais recentes primeiro) e o Reverter. `revert` repõe o livro; devolve se conseguiu. */
export function useAiChanges({ isbn, enabled, revert, restore }: { isbn: string | undefined; enabled: boolean; revert: (change: AiChange) => Promise<boolean>; restore: (change: AiChange) => Promise<boolean> }) {
    const queryClient = useQueryClient();
    const [busyId, setBusyId] = useState<string | null>(null);
    const { data, isLoading, isError } = useQuery({
        queryKey: ['ai-changes', isbn],
        queryFn: () => ebooksApi.listAiChanges(isbn!),
        enabled: !!isbn && enabled, // só pede quando a vista está aberta
    });
    const run = useCallback(async (change: AiChange, action: (c: AiChange) => Promise<boolean>) => {
        setBusyId(change.id);
        const ok = await action(change);
        if (ok) await queryClient.invalidateQueries({ queryKey: ['ai-changes', isbn] });
        setBusyId(null);
        return ok;
    }, [queryClient, isbn]);
    const revertChange = useCallback((change: AiChange) => run(change, revert), [run, revert]);
    const restoreChange = useCallback((change: AiChange) => run(change, restore), [run, restore]);
    return { changes: data ?? [], isLoading, isError, busyId, revertChange, restoreChange };
}
