import { useQuery } from '@tanstack/react-query';
import apiClient from '../../../api/client';

const LT_URL: string = import.meta.env.VITE_LANGUAGETOOL_URL ?? 'https://api.languagetool.org/v2/check';

async function probe(): Promise<boolean> {
    try {
        if (LT_URL.startsWith('/api/')) return (await apiClient.get('/languagetool/status')).data.available === true;
        return (await fetch(LT_URL.replace(/\/check$/, '/languages'), { signal: AbortSignal.timeout(3000) })).ok;
    } catch {
        return false;
    }
}

/** O servidor de revisão gramatical responde? Só esconde a opção quando confirmado em baixo (não enquanto carrega). */
export function useGrammarAvailable(): boolean {
    const { data } = useQuery({ queryKey: ['grammar-available'], queryFn: probe, refetchInterval: 60_000, staleTime: 30_000 });
    return data !== false;
}
