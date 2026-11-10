import { useState } from 'react';
import { StyleMenu } from './panelFields';
import { readCustomStyle } from '../../../utils/book-css';
import type { UserStyleKind } from '../../../utils/user-styles';

// Clonar / Editar / Apagar de um estilo de utilizador (caixa, carácter ou parágrafo): o fluxo é igual nos três painéis,
// só muda o tipo. Quem usa decide o que "Editar" faz e onde mostrar `notices` (confirmação de apagar e erro de clonar).

export const deleteQuestion = (kind: UserStyleKind, cls: string): string =>
    `Apagar o estilo "${kind.label(cls)}" e retirá-lo ${kind.where} onde foi aplicado?`;

/** Cria `cls-copia…` com as declarações de `cls`. Devolve o erro, ou null se criou. */
export const cloneStyle = (kind: UserStyleKind, css: string, cls: string, create: (cls: string, body: string) => string | null): string | null =>
    create(kind.clone(kind.list(css), cls), readCustomStyle(css, cls));

export function useUserStyleActions(kind: UserStyleKind, css: string, ops: { create: (cls: string, body: string) => string | null; remove: (cls: string) => void }) {
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState<string | null>(null); // estilo à espera de confirmação para apagar
    return {
        /** Menu ⋯ do estilo `cls`; `light` = chip escuro. */
        menu: (cls: string, light: boolean, onEdit: () => void) => (
            <StyleMenu label={kind.label(cls)} light={light} onEdit={onEdit}
                onClone={() => setError(cloneStyle(kind, css, cls, ops.create) ?? '')} onDelete={() => setDeleting(cls)} />
        ),
        notices: (
            <>
                {deleting && (
                    <div className="basis-full flex flex-col gap-2">
                        <p className="text-xs text-rose-700">{deleteQuestion(kind, deleting)}</p>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => { ops.remove(deleting); setDeleting(null); }} className="h-8 px-3 rounded-lg bg-rose-600 text-white text-xs hover:bg-rose-700">Apagar</button>
                            <button type="button" onClick={() => setDeleting(null)} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-slate-50">Cancelar</button>
                        </div>
                    </div>
                )}
                {error && <div className="basis-full text-xs text-rose-600">{error}</div>}
            </>
        ),
    };
}
