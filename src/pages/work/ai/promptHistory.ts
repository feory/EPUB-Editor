// Recuperar pedidos anteriores com ↑/↓ na caixa do assistente. `at` = quantos pedidos para trás (0 = o último); null = o rascunho
// que o utilizador estava a escrever. Puro, para se testar sem a interface.

export function recallStep(count: number, at: number | null, dir: 'up' | 'down'): number | null {
    if (dir === 'up') return count === 0 ? at : Math.min((at ?? -1) + 1, count - 1);
    return at === null || at === 0 ? null : at - 1;
}

/** O texto para `at`: o pedido (de trás para a frente) ou o rascunho. */
export const recalled = (prompts: string[], at: number | null, draft: string) => (at === null ? draft : prompts[prompts.length - 1 - at]);
