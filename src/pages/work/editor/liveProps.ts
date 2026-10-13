import { useLayoutEffect, useRef } from 'react';

// Valor sempre atual para código que corre uma só vez (setup() do TinyMCE, listeners do editor): lê-se por
// `live.current.x` em vez de uma closure presa ao 1.º render. Um só objeto em vez de um par ref/atribuição por prop.
// Atualiza no commit (os handlers só correm depois dele); o 1.º valor já vem do useRef.
export function useLive<T>(value: T): React.MutableRefObject<T> {
    const ref = useRef(value);
    useLayoutEffect(() => { ref.current = value; });
    return ref;
}
