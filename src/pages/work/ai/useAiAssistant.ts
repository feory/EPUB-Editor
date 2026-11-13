import { useState, useCallback, useRef, useEffect } from 'react';
import { isAxiosError } from 'axios';
import { ebooksApi } from '../../../api/ebooks-api';
import { runAgent, appliedNote, discardedNote, renameProposalStyle, type AgentMessage, type AgentResult } from './aiAgent';
import { chatKey, compactHistory, loadChat, saveChat } from './chatStore';

export interface AiLine { role: 'user' | 'assistant'; text: string }

const LOST_PROPOSAL = 'A proposta que estava por aplicar perdeu-se ao recarregar a página; nada foi alterado. Pede de novo se a quiseres.';

/** Estado do painel de IA: conversa (para mostrar), mensagens da API (para continuar), proposta pendente. A conversa sobrevive a recarregar (chatStore.ts). */
export function useAiAssistant({ isbn, userId, getParts, getCss, applyProposal }: {
    isbn: string | undefined;
    userId: string | number | undefined;
    getParts: () => string[];
    getCss: () => string;
    applyProposal: (proposal: NonNullable<AgentResult['proposal']>, request: string) => Promise<unknown>;
}) {
    const key = chatKey(isbn, userId);
    const [stored] = useState(() => loadChat(key)); // lido uma vez, ao abrir o livro
    // Uma proposta por aplicar não se guarda (o livro pode ter mudado): avisa-se o utilizador e o modelo.
    const [lines, setLines] = useState<AiLine[]>(() => (stored?.pending ? [...stored.lines, { role: 'assistant', text: LOST_PROPOSAL }] : stored?.lines ?? []));
    const [proposal, setProposal] = useState<AgentResult['proposal']>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const history = useRef<AgentMessage[]>(stored ? (stored.pending ? [...stored.history, { role: 'user', content: `[Sistema: ${LOST_PROPOSAL}]` }] : stored.history) : []);
    const request = useRef('');

    // Guarda a conversa a cada mudança (as mensagens da API mudam sempre juntamente com `lines` ou `proposal`).
    const persist = useCallback(() => saveChat(key, { lines, history: history.current, pending: !!proposal }), [key, lines, proposal]);
    useEffect(() => { persist(); }, [persist]);

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
            history.current = compactHistory(result.messages); // só o texto: as ferramentas não se reenviam nos pedidos seguintes (poupa tokens)
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

    /** Depois de o utilizador reverter uma alteração no registo, o modelo tem de saber (senão julga que ainda está aplicada). */
    const noteReverted = useCallback((reverted: string) => {
        history.current = [...history.current, { role: 'user', content: `[Sistema: o utilizador REVERTEU a alteração "${reverted}". O livro e os estilos voltaram ao estado anterior a ela.]` }];
        persist();
    }, [persist]);

    const discard = useCallback(() => {
        if (proposal) history.current = [...history.current, discardedNote()];
        setProposal(null);
    }, [proposal]);
    const reset = useCallback(() => { history.current = []; setLines([]); setProposal(null); setError(''); }, []); // o efeito apaga o que estava guardado

    return { lines, proposal, busy, error, send, apply, discard, renameStyle, noteReverted, reset };
}
