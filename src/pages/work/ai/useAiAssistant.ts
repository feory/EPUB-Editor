import { useState, useCallback, useRef, useEffect } from 'react';
import { ebooksApi } from '../../../api/ebooks-api';
import { runAgent, appliedNote, discardedNote, renameProposalStyle, summarizeProposal, type AgentMessage, type AgentResult } from './aiAgent';
import { blockContext, type SelectedBlocks } from './aiSelection';
import type { AiWorkspace } from './aiWorkspace';
import { aiErrorMessage } from './aiError';
import { chatKey, compactHistory, loadChat, saveChat } from './chatStore';

export interface AiLine { role: 'user' | 'assistant'; text: string }

const LOST_PROPOSAL = 'A proposta que estava por aplicar perdeu-se ao recarregar a página; nada foi alterado. Pede de novo se a quiseres.';

/** Estado do painel de IA: conversa (para mostrar), mensagens da API (para continuar), proposta pendente. A conversa sobrevive a recarregar (chatStore.ts). */
export function useAiAssistant({ isbn, userId, workspace, selected }: {
    isbn: string | undefined;
    userId: string | number | undefined;
    workspace: AiWorkspace;
    /** O bloco selecionado no editor (null = nenhum): estado reativo, por isso vem à parte do workspace. */
    selected: SelectedBlocks | null;
}) {
    const key = chatKey(isbn, userId);
    const [stored] = useState(() => loadChat(key)); // lido uma vez, ao abrir o livro
    // Uma proposta por aplicar não se guarda (o livro pode ter mudado): avisa-se o utilizador e o modelo.
    const [lines, setLines] = useState<AiLine[]>(() => (stored?.pending ? [...stored.lines, { role: 'assistant', text: LOST_PROPOSAL }] : stored?.lines ?? []));
    const [proposal, setProposal] = useState<AgentResult['proposal']>(null);
    // O relatório preparado (texto) fica por descarregar até pedir outro ou limpar a conversa; não se guarda ao recarregar a página.
    const [report, setReport] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [step, setStep] = useState(''); // o que o assistente está a fazer (vazio = nada em especial)
    const [error, setError] = useState('');
    const history = useRef<AgentMessage[]>(stored ? (stored.pending ? [...stored.history, { role: 'user', content: `[Sistema: ${LOST_PROPOSAL}]` }] : stored.history) : []);
    const request = useRef('');
    const controller = useRef<AbortController | null>(null);
    // O utilizador tira o âmbito (×) para o bloco atual; um bloco diferente volta a limitá-lo.
    const selectedKey = selected ? `${selected.index}${selected.item ?? ''}:${selected.tags.join()}:${selected.texts.join('|')}` : null;
    const [offFor, setOffFor] = useState<string | null>(null);
    const scoped = selected && selectedKey !== offFor ? selected : null;
    const clearScope = useCallback(() => setOffFor(selectedKey), [selectedKey]);

    // Guarda a conversa a cada mudança (as mensagens da API mudam sempre juntamente com `lines` ou `proposal`).
    const persist = useCallback(() => saveChat(key, { lines, history: history.current, pending: !!proposal }), [key, lines, proposal]);
    useEffect(() => { persist(); }, [persist]);

    /** `true` se o pedido terminou; `false` se não chegou a correr, falhou ou foi cancelado (a interface devolve o texto à caixa). */
    const send = useCallback(async (text: string): Promise<boolean> => {
        if (!isbn || !text.trim() || busy) return false;
        request.current = text.trim();
        const block = scoped ? workspace.locate(scoped) : null;
        if (scoped && !block) { setError('Não encontrei os blocos selecionados no livro. Seleciona-os de novo no editor ou tira o âmbito (×).'); return false; }
        setLines((l) => [...l, { role: 'user', text: request.current }]);
        setProposal(null); setError(''); setBusy(true);
        const abort = controller.current = new AbortController();
        try {
            const result = await runAgent({
                messages: [...history.current, { role: 'user', content: block ? blockContext(workspace.parts(), block) + request.current : request.current }],
                scope: block,
                signal: abort.signal,
                onStep: setStep,
                send: async (messages, signal) => (await ebooksApi.aiChat(isbn, messages, signal)).data,
                workspace,
            });
            history.current = compactHistory(result.messages); // só o texto: as ferramentas não se reenviam nos pedidos seguintes (poupa tokens)
            setLines((l) => [...l, { role: 'assistant', text: result.text || '(sem resposta)' }]);
            setProposal(result.proposal);
            if (result.report) setReport(result.report);
            return true;
        } catch (e) {
            if (abort.signal.aborted) { setLines((l) => [...l, { role: 'assistant', text: 'Pedido cancelado.' }]); return false; }
            setError(aiErrorMessage(e));
            return false;
        } finally { controller.current = null; setStep(''); setBusy(false); }
    }, [isbn, busy, workspace, scoped]);

    /** Parar: cancela o pedido em curso (o modelo deixa de ser chamado; o que a ferramenta já corria acaba sozinho). */
    const stop = useCallback(() => controller.current?.abort(), []);

    const apply = useCallback(async () => {
        if (!proposal) return;
        setBusy(true); setError('');
        try {
            await workspace.apply(proposal, request.current, summarizeProposal(proposal));
            history.current = [...history.current, appliedNote(proposal)]; // o modelo tem de saber que foi aplicado
            setProposal(null);
        } catch { setError('Não foi possível aplicar (gravar a versão anterior falhou).'); }
        finally { setBusy(false); }
    }, [proposal, workspace]);

    /** O utilizador muda o nome de um estilo novo da proposta; o resultado (ou o erro) volta para a interface. */
    const renameStyle = useCallback((oldCls: string, name: string): string | null => {
        if (!proposal) return null;
        const res = renameProposalStyle(proposal, oldCls, name, { parts: workspace.parts(), css: workspace.css() });
        if ('error' in res) return res.error;
        setProposal(res.proposal);
        return null;
    }, [proposal, workspace]);

    /** Depois de o utilizador reverter uma alteração no registo, o modelo tem de saber (senão julga que ainda está aplicada). */
    const noteReverted = useCallback((reverted: string) => {
        history.current = [...history.current, { role: 'user', content: `[Sistema: o utilizador REVERTEU a alteração "${reverted}". O livro e os estilos voltaram ao estado anterior a ela.]` }];
        persist();
    }, [persist]);

    const discard = useCallback(() => {
        if (proposal) history.current = [...history.current, discardedNote()];
        setProposal(null);
    }, [proposal]);
    const reset = useCallback(() => { history.current = []; setLines([]); setProposal(null); setReport(null); setError(''); }, []); // o efeito apaga o que estava guardado

    return { lines, proposal, report, busy, step, error, scoped, clearScope, send, stop, apply, discard, renameStyle, noteReverted, reset };
}
