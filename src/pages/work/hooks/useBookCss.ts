import { useCallback, useRef } from 'react';
import { ebooksApi } from '../../../api/ebooks-api';
import { useStyles } from '../../../context/StyleContext';
import { applyRule } from '../../../utils/css-rule';
import { createCustomStyle } from '../../../utils/book-css';
import { textPatchToDecls, type TextProps } from '../editor/textProps';

/**
 * Editar o CSS do livro a partir do editor: aplica já (StyleContext) e grava com debounce — todas as
 * alterações passam por `commit`, por isso há um só temporizador e o último texto é sempre o que se grava.
 */
export function useBookCss(isbn: string | undefined, debounceMs = 600) {
    const { setCustomCss, getCurrentCss } = useStyles();
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    const commit = useCallback((next: string) => {
        setCustomCss(next);
        clearTimeout(timer.current);
        if (isbn) timer.current = setTimeout(() => ebooksApi.saveStyle(isbn, next), debounceMs);
    }, [isbn, setCustomCss, debounceMs]);

    /** Modo "Estilo" do painel de bloco: altera os campos da regra `selector`. */
    const editRule = useCallback((selector: string, patch: Partial<TextProps>) =>
        commit(applyRule(getCurrentCss(), selector, textPatchToDecls(patch))), [commit, getCurrentCss]);

    /** "Criar estilo…": devolve o erro, ou null se criou. */
    const createStyle = useCallback((cls: string, body: string): string | null => {
        const created = createCustomStyle(getCurrentCss(), cls, body);
        if ('error' in created) return created.error;
        commit(created.css);
        return null;
    }, [commit, getCurrentCss]);

    return { editRule, createStyle };
}
