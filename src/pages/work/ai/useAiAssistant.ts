import { useState, useCallback, useRef } from 'react';
import { isAxiosError } from 'axios';
import { ebooksApi } from '../../../api/ebooks-api';
import { runAgent, appliedNote, discardedNote, renameProposalStyle, type AgentMessage, type AgentResult } from './aiAgent';

export interface AiLine { role: 'user' | 'assistant'; text: string }

/** Estado do painel de IA: conversa (para mostrar), mensagens da API (para continuar), proposta pendente. */
export function useAiAssistant({ isbn, getParts, getCss, applyProposal }: {
    isbn: string | undefined;
    getParts: () => string[];
    getCss: () => string;
    applyProposal: (proposal: NonNullable<AgentResult['proposal']>, request: string) => Promise<void>;
}) {
    const [lines, setLines] = useState<AiLine[]>([]);
    const [proposal, setProposal] = useState<AgentResult['proposal']>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const history = useRef<AgentMessage[]>([]);
    const request = useRef('');

    const send = useCallback(async (text: string) => {
        if (!isbn || !text.trim() || busy) return;
        request.current = text.trim();
        setLines((l) => [...l, { role: 'user', text: request.current }]);
        setProposal(null); setError(''); setBusy(true);
        try {
            const result = await runAgent({
                messages: [...history.current, { role: 'user', content: request.current }],
                send: async (messages) => (await ebooksApi.aiChat(isbn, messages)).data,
                book: { parts: getParts(), css: getCss() },
            });
            history.current = result.messages;
            setLines((l) => [...l, { role: 'assistant', text: result.text || '(sem resposta)' }]);
            setProposal(result.proposal);
        } catch (e) {
            setError(isAxiosError(e) ? (e.response?.data as { error?: string } | undefined)?.error ?? 'Erro de rede' : 'Erro inesperado');
        } finally { setBusy(false); }
    }, [isbn, busy, getParts, getCss]);

    const apply = useCallback(async () => {
        if (!proposal) return;
        setBusy(true); setError('');
        try {
            await applyProposal(proposal, request.current);
            history.current = [...history.current, appliedNote(proposal)]; // o modelo tem de saber que foi aplicado
            setProposal(null);
            setLines((l) => [...l, { role: 'assistant', text: 'Aplicado' }]);
        } catch { setError('Não foi possível aplicar (gravar a versão anterior falhou).'); }
        finally { setBusy(false); }
    }, [proposal, applyProposal]);

    /** O utilizador muda o nome de um estilo novo da proposta; o resultado (ou o erro) volta para a interface. */
    const renameStyle = useCallback((oldCls: string, name: string): string | null => {
        if (!proposal) return null;
        const res = renameProposalStyle(proposal, oldCls, name, { parts: getParts(), css: getCss() });
        if ('error' in res) return res.error;
        setProposal(res.proposal);
        return null;
    }, [proposal, getParts, getCss]);

    const discard = useCallback(() => {
        if (proposal) history.current = [...history.current, discardedNote()];
        setProposal(null);
    }, [proposal]);
    const reset = useCallback(() => { history.current = []; setLines([]); setProposal(null); setError(''); }, []);

    return { lines, proposal, busy, error, send, apply, discard, renameStyle, reset };
}
