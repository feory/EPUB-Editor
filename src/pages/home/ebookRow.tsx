import React, { useReducer, useState } from 'react';
import { Settings, ImageIcon, Share2 } from 'lucide-react';
import type { Ebook } from '../../api/ebooks-api';

// O que as vistas da Home (grelha, compacta, tabelas, estante) partilham por ebook: o passo de confirmação
// (concluir OU eliminar, nunca os dois), o descarregamento em curso, os rótulos e o menu ⋯. As vistas ficam só com o layout.

export interface RowState { confirming: string | null; deleting: string | null }
export type RowAction = { type: 'askComplete' | 'askDelete'; isbn: string } | { type: 'cancel' };

export function rowReducer(_state: RowState, action: RowAction): RowState {
    switch (action.type) {
        case 'askComplete': return { confirming: action.isbn, deleting: null };
        case 'askDelete': return { confirming: null, deleting: action.isbn };
        case 'cancel': return { confirming: null, deleting: null };
    }
}

export const deleteLabels = (shared: boolean) => shared
    ? { ask: 'Remover partilha', confirm: 'Remover a partilha (o ebook continua com o dono)' }
    : { ask: 'Eliminar registo', confirm: 'Enviar para a Reciclagem (recuperável 30 dias)' };

/** Estado por linha: `confirming`/`deleting` = esse ebook está à espera de confirmação; `idle` = nenhum passo aberto. */
export function useEbookRow() {
    const [state, dispatch] = useReducer(rowReducer, { confirming: null, deleting: null });
    const [downloadingIsbn, setDownloadingIsbn] = useState<string | null>(null);
    return {
        confirming: (isbn: string) => state.confirming === isbn,
        deleting: (isbn: string) => state.deleting === isbn,
        idle: (isbn: string) => state.confirming !== isbn && state.deleting !== isbn,
        downloading: (isbn: string) => downloadingIsbn === isbn,
        askComplete: (isbn: string) => dispatch({ type: 'askComplete', isbn }),
        askDelete: (isbn: string) => dispatch({ type: 'askDelete', isbn }),
        cancel: () => dispatch({ type: 'cancel' }),
        async download(isbn: string, run: (isbn: string) => Promise<void>) {
            setDownloadingIsbn(isbn);
            try { await run(isbn); } finally { setDownloadingIsbn(null); }
        },
    };
}

type Handler = (e: React.MouseEvent, ebook: Ebook) => void;

/** Itens do menu ⋯ de um ebook em curso: Partilha só para o dono. */
export function ebookMenuItems(ebook: Ebook, shared: boolean, h: { onOpenMetadata?: Handler; onOpenCover?: Handler; onShare?: Handler }) {
    return [
        ...(h.onOpenMetadata ? [{ icon: <Settings size={13} />, label: 'Edição da Informação', onClick: (e: React.MouseEvent) => h.onOpenMetadata!(e, ebook) }] : []),
        ...(h.onOpenCover ? [{ icon: <ImageIcon size={13} />, label: 'Capa', onClick: (e: React.MouseEvent) => h.onOpenCover!(e, ebook) }] : []),
        ...(h.onShare && !shared ? [{ icon: <Share2 size={13} />, label: 'Partilha', onClick: (e: React.MouseEvent) => h.onShare!(e, ebook) }] : []),
    ];
}
