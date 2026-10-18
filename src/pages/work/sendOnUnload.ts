import { getAccessToken, clientId } from '../../api/client';
import { compressHtml } from '../../utils/compression';

// Os browsers recusam pedidos keepalive com corpo acima de ~64 KB (o fetch rejeita logo). Abaixo disto
// usa-se keepalive; acima, um pedido normal — só conclui se o utilizador ficar na página (cancelar o aviso de
// "alterações por gravar"); quem sai conta com o rascunho local (saver.exit grava-o).
export const KEEPALIVE_MAX_BYTES = 60_000;

// Fechar/recarregar o separador: o pedido tem de sobreviver à página.
// sendBeacon não serve — não deixa pôr o cabeçalho Authorization.
export function sendOnUnload(isbn: string, content: string, doFetch: typeof fetch = fetch) {
    const token = getAccessToken();
    const body = JSON.stringify({ content: compressHtml(content) });
    doFetch(`/api/ebooks/${isbn}/content`, {
        method: 'POST',
        keepalive: body.length <= KEEPALIVE_MAX_BYTES,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': clientId,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
    }).catch(() => { /* a página está a fechar */ });
}
