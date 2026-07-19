import { useEffect, useRef, useState } from 'react';
import { ebooksApi, type PresenceStatus } from '../../../api/ebooks-api';
import { setLockedHandler } from '../../../api/client';
import { useNotification } from '../../../context/NotificationContext';

const HEARTBEAT_MS = 5_000;

export interface PresenceState {
    readOnly: boolean;          // fixado na 1ª resposta — define a sessão
    holderEmail: string | null; // quem está a editar
    others: string[];           // outros utilizadores presentes
    freed: boolean;             // começou readonly mas o lock libertou-se → recarregar p/ editar
}

export function usePresence(isbn: string | undefined): PresenceState {
    const { showNotification } = useNotification();
    const [state, setState] = useState<PresenceState>({ readOnly: false, holderEmail: null, others: [], freed: false });
    const readOnlyRef = useRef<boolean | null>(null); // null = ainda não determinado

    useEffect(() => {
        if (!isbn) return;
        let cancelled = false;

        const apply = (s: PresenceStatus) => {
            if (cancelled) return;
            if (readOnlyRef.current === null) readOnlyRef.current = !s.canEdit; // fixa na 1ª resposta
            const readOnly = readOnlyRef.current;
            setState({
                readOnly,
                holderEmail: s.holderEmail,
                others: s.others,
                freed: readOnly && s.canEdit, // era leitura, agora podia editar
            });
        };

        const beat = () => ebooksApi.heartbeat(isbn).then(r => apply(r.data)).catch(() => { /* TTL trata */ });
        beat();
        const interval = setInterval(beat, HEARTBEAT_MS);
        const onHide = () => ebooksApi.releasePresence(isbn);
        window.addEventListener('pagehide', onHide);

        // backstop: escrita rejeitada pelo servidor (409 locked)
        setLockedHandler(() => showNotification('info', 'Modo leitura: outro utilizador está a editar este projeto.'));

        return () => {
            cancelled = true;
            clearInterval(interval);
            window.removeEventListener('pagehide', onHide);
            setLockedHandler(null);
            ebooksApi.releasePresence(isbn);
        };
    }, [isbn, showNotification]);

    return state;
}
