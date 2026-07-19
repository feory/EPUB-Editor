import { useEffect } from 'react';

// Bloqueia o scroll do body enquanto o componente (ex. modal) está ativo.
// Evita que o scroll do rato fora do modal mova a página/editor por trás.
// `active` para modais que se auto-gateiam por prop (ex. `isOpen`) e chamam o hook antes do return null.
export function useBodyScrollLock(active = true) {
    useEffect(() => {
        if (!active) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [active]);
}
