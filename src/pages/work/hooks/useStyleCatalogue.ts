import { useMemo } from 'react';
import { USER_STYLES, type UserStyleKind, type UserStyleKindName } from '../../../utils/user-styles';

/** O que o catálogo precisa do CSS do livro (useBookCss) — cada função devolve o erro, ou null se gravou. */
export interface CssSide {
    createStyle(cls: string, body: string): string | null;
    saveStyle(cls: string, body: string, newCls: string): string | null;
    deleteStyle(cls: string): void;
}

/** O que o catálogo precisa do HTML do livro (useEbookWork). */
export interface BookSide {
    renameStyle(kind: UserStyleKind, from: string, to: string): void;
    removeStyle(kind: UserStyleKind, cls: string): void;
}

/** As três operações de um tipo de estilo de utilizador, já com a ordem certa entre CSS e HTML. */
export interface StyleSet {
    /** Cria o estilo `cls` (declarações `body`). Devolve o erro, ou null se criou. */
    create(cls: string, body: string): string | null;
    /** Guarda as declarações e, se `newCls` mudou, o nome (o HTML passa à classe nova). Devolve o erro, ou null. */
    save(cls: string, body: string, newCls: string): string | null;
    /** Apaga o estilo e retira-o do HTML do livro. */
    remove(cls: string): void;
}

export type StyleCatalogue = Record<UserStyleKindName, StyleSet>;

/**
 * Catálogo de estilos de utilizador. É dono da ordem entre as duas escritas: o CSS vai primeiro; se der erro (nome repetido,
 * estilo inexistente) pára sem tocar no HTML; o HTML só muda se o nome mudou. Sem rollback se a 2.ª escrita falhar.
 */
export function createStyleCatalogue(css: CssSide, book: BookSide): StyleCatalogue {
    const setOf = (kind: UserStyleKind): StyleSet => ({
        create: css.createStyle,
        save(cls, body, newCls) {
            const err = css.saveStyle(cls, body, newCls);
            if (!err && newCls !== cls) book.renameStyle(kind, cls, newCls);
            return err;
        },
        remove(cls) {
            css.deleteStyle(cls);
            book.removeStyle(kind, cls);
        },
    });
    return Object.fromEntries(Object.entries(USER_STYLES).map(([name, kind]) => [name, setOf(kind)])) as StyleCatalogue;
}

export const useStyleCatalogue = (css: CssSide, book: BookSide): StyleCatalogue =>
    // eslint-disable-next-line react-hooks/exhaustive-deps -- css/book são conjuntos de callbacks estáveis (useCallback); os objetos é que mudam a cada render
    useMemo(() => createStyleCatalogue(css, book), [css.createStyle, css.saveStyle, css.deleteStyle, book.renameStyle, book.removeStyle]);
