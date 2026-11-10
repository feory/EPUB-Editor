import { useCallback, useEffect, useRef } from 'react';
import { ebooksApi } from '../../../api/ebooks-api';
import { useStyles } from '../../../context/StyleContext';
import { applyBookRule, createCustomStyle, updateCustomStyle, renameCustomStyle, deleteCustomStyle } from '../../../utils/book-css';
import { textPatchToDecls, type TextProps } from '../editor/textProps';

/**
 * Editar o CSS do livro a partir do editor: aplica já (StyleContext) e grava com debounce — todas as
 * alterações passam por `commit`, por isso há um só temporizador e o último texto é sempre o que se grava.
 * O que ainda está à espera do temporizador grava-se já ao sair do editor ou ao esconder/fechar o separador.
 */
export function useBookCss(isbn: string | undefined, debounceMs = 600) {
    const { setCustomCss, getCurrentCss } = useStyles();
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const pending = useRef<string | null>(null); // CSS à espera de gravar

    const flush = useCallback(() => {
        clearTimeout(timer.current);
        if (pending.current !== null && isbn) ebooksApi.saveStyle(isbn, pending.current);
        pending.current = null;
    }, [isbn]);

    const commit = useCallback((next: string) => {
        setCustomCss(next);
        clearTimeout(timer.current);
        if (!isbn) return;
        pending.current = next;
        timer.current = setTimeout(flush, debounceMs);
    }, [isbn, setCustomCss, debounceMs, flush]);

    useEffect(() => {
        const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
        document.addEventListener('visibilitychange', onHidden);
        window.addEventListener('pagehide', flush);
        return () => {
            document.removeEventListener('visibilitychange', onHidden);
            window.removeEventListener('pagehide', flush);
            flush();
        };
    }, [flush]);

    /** Modo "Estilo" do painel de bloco: altera os campos da regra `selector`. */
    const editRule = useCallback((selector: string, patch: Partial<TextProps>) =>
        commit(applyBookRule(getCurrentCss(), selector, textPatchToDecls(patch))), [commit, getCurrentCss]);

    /** "Criar estilo…": devolve o erro, ou null se criou. */
    const createStyle = useCallback((cls: string, body: string): string | null => {
        const created = createCustomStyle(getCurrentCss(), cls, body);
        if ('error' in created) return created.error;
        commit(created.css);
        return null;
    }, [commit, getCurrentCss]);

    /** Guardar um estilo: novas declarações e, se `newCls` mudou, novo nome — numa só gravação do CSS. Devolve o erro, ou null. */
    const saveStyle = useCallback((cls: string, body: string, newCls: string): string | null => {
        const updated = updateCustomStyle(getCurrentCss(), cls, body);
        if ('error' in updated) return updated.error;
        if (newCls === cls) { commit(updated.css); return null; }
        const renamed = renameCustomStyle(updated.css, cls, newCls);
        if ('error' in renamed) return renamed.error;
        commit(renamed.css);
        return null;
    }, [commit, getCurrentCss]);

    const deleteStyle = useCallback((cls: string) => commit(deleteCustomStyle(getCurrentCss(), cls)), [commit, getCurrentCss]);

    return { editRule, createStyle, saveStyle, deleteStyle };
}
