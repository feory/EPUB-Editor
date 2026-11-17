import { isAxiosError } from 'axios';

const wait = (seconds: number) => (seconds < 90 ? `${Math.ceil(seconds)} s` : `${Math.ceil(seconds / 60)} min`);

/**
 * O erro de um pedido ao assistente, em texto para o utilizador. No 429 do limite de pedidos o servidor manda `Retry-After`
 * (segundos): diz-se quanto esperar em vez de "tenta mais tarde".
 */
export function aiErrorMessage(e: unknown): string {
    if (!isAxiosError(e)) return 'Erro inesperado';
    const message = (e.response?.data as { error?: string } | undefined)?.error ?? 'Erro de rede';
    const seconds = Number(e.response?.headers?.['retry-after']);
    return e.response?.status === 429 && seconds > 0 ? `${message.replace(/ Tenta mais tarde\.?$/, '')} Tenta daqui a ${wait(seconds)}.` : message;
}
