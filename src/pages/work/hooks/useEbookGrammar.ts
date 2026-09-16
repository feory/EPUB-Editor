import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ebooksApi } from '../../../api/ebooks-api';

// Forma "slim" produzida por processBatch (editorDom.ts, verificação LanguageTool) e por
// spell.worker.ts (ortografia local, ainda não instanciado) — mesmo shape para os dois.
export interface GrammarMatch {
    offset: number;
    length: number;
    message: string;
    shortMessage?: string;
    replacements?: { value: string }[];
    context?: { text: string; offset: number; length: number };
    rule?: { id?: string; issueType?: string };
    paragraphIndex: number;
    word?: string;
}

export function useEbookGrammar({ isbn }: { isbn: string | undefined }) {
    const [grammarIssues, setGrammarIssues] = useState<GrammarMatch[]>([]);
    const [grammarCache, setGrammarCache] = useState<Record<string, GrammarMatch[]>>({});
    const queryClient = useQueryClient();

    const { data: grammarData } = useQuery({
        queryKey: ['ebook-grammar', isbn],
        queryFn: async () => {
            try {
                const res = await ebooksApi.getGrammar(isbn!);
                if (res.data.cache) setGrammarCache(res.data.cache);
                return res.data.matches || [];
            } catch {
                return [];
            }
        },
        enabled: !!isbn,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
    });

    // grammarIssues é estado independente (mutado depois por resolve/dismiss), só semeado
    // a partir da query quando esta resolve com dados novos — não substitui resoluções locais
    // em curso nem limpa ao devolver vazio (refetch transitório).
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (grammarData && grammarData.length > 0) setGrammarIssues(grammarData);
    }, [grammarData]);

    const saveGrammarMutation = useMutation({
        mutationFn: ({ matches, cache }: { matches: GrammarMatch[]; cache?: Record<string, GrammarMatch[]> }) =>
            ebooksApi.saveGrammar(isbn!, matches, cache ?? {}),
        onSuccess: (_, { matches, cache }) => {
            if (cache) setGrammarCache(prev => ({ ...prev, ...cache }));
            // Keep RQ cache in sync so stale data on next visit is correct, not old empty value
            queryClient.setQueryData(['ebook-grammar', isbn], matches);
        },
    });

    const handleResolveIssue = useCallback((index: number) => {
        const newIssues = grammarIssues.filter((_, i) => i !== index);
        setGrammarIssues(newIssues);
        saveGrammarMutation.mutate({ matches: newIssues });
    }, [grammarIssues, saveGrammarMutation]);

    const handleResolveMultiple = useCallback((indices: number[]) => {
        const indexSet = new Set(indices);
        const newIssues = grammarIssues.filter((_, i) => !indexSet.has(i));
        setGrammarIssues(newIssues);
        saveGrammarMutation.mutate({ matches: newIssues });
    }, [grammarIssues, saveGrammarMutation]);

    const handleSaveGrammar = useCallback(
        (matches: GrammarMatch[], cache?: Record<string, GrammarMatch[]>) => saveGrammarMutation.mutate({ matches, cache }),
        [saveGrammarMutation]
    );

    return {
        grammarIssues,
        setGrammarIssues,
        grammarCache,
        saveGrammarMutation,
        handleSaveGrammar,
        handleResolveIssue,
        handleResolveMultiple,
    };
}
