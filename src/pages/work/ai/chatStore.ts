// A conversa do assistente sobrevive a recarregar a página: guarda-se no browser (localStorage), por livro e por utilizador.
// O que se guarda é a conversa em TEXTO: as chamadas às ferramentas (resumo do livro, simulações) ficam de fora — o modelo volta a
// pedi-las se precisar — e isso também poupa tokens, porque o histórico é reenviado a cada pedido.
import type { AgentMessage } from './aiAgent';
import type { AiLine } from './useAiAssistant';

const VERSION = 1;
const MAX_LINES = 60;
const MAX_MESSAGES = 40;
const MAX_BYTES = 300_000;

export interface StoredChat { lines: AiLine[]; history: AgentMessage[]; pending: boolean }

const textOf = (m: AgentMessage): string =>
    typeof m.content === 'string' ? m.content : m.content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n');

/**
 * Só o texto de cada mensagem: tira tool_use, tool_result, thinking, etc. e as mensagens que ficam vazias; junta as seguidas do
 * mesmo autor (uma nota do sistema + a mensagem a seguir); corta ao fim de MAX_MESSAGES e começa sempre por uma do utilizador.
 */
export function compactHistory(messages: AgentMessage[]): AgentMessage[] {
    const out: AgentMessage[] = [];
    for (const m of messages) {
        const text = textOf(m).trim();
        if (!text) continue;
        const last = out[out.length - 1];
        if (last && last.role === m.role) last.content = `${last.content as string}\n\n${text}`;
        else out.push({ role: m.role, content: text });
    }
    const tail = out.slice(-MAX_MESSAGES);
    while (tail.length && tail[0].role !== 'user') tail.shift();
    return tail;
}

export const chatKey = (isbn: string | undefined, userId: string | number | undefined) => (isbn && userId !== undefined ? `ai-chat:${isbn}:${userId}` : null);

/** `storage` injetável (testes). Nunca lança: sem localStorage, em modo privado ou com dados estragados devolve null / não grava. */
export function loadChat(key: string | null, storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): StoredChat | null {
    if (!key) return null;
    try {
        const data = JSON.parse(storage?.getItem(key) ?? 'null');
        if (data?.v !== VERSION || !Array.isArray(data.lines) || !Array.isArray(data.history)) return null;
        return { lines: data.lines, history: data.history, pending: data.pending === true };
    } catch { return null; }
}

export function saveChat(key: string | null, chat: StoredChat, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage): void {
    if (!key) return;
    try {
        if (chat.lines.length === 0 && chat.history.length === 0) { storage?.removeItem(key); return; }
        let payload = { v: VERSION, lines: chat.lines.slice(-MAX_LINES), history: compactHistory(chat.history), pending: chat.pending };
        // Cabe? senão vai deitando o mais antigo até caber.
        while (JSON.stringify(payload).length > MAX_BYTES && payload.lines.length > 2) {
            payload = { ...payload, lines: payload.lines.slice(2), history: payload.history.slice(2) };
        }
        storage?.setItem(key, JSON.stringify(payload));
    } catch { /* quota cheia ou storage indisponível: a conversa só não sobrevive ao recarregar */ }
}
