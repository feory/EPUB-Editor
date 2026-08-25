import { cleanHeadings, CHAPTER_SPLIT_PATTERN } from '../../../utils/html-cleaner';

// Desfazer/refazer é do undoManager do TinyMCE (botões da toolbar E ⌘Z, desde 0.9.5.6).
// Existia aqui uma 2ª pilha (past/future, snapshots do livro inteiro) ligada só ao atalho:
// nunca andava mais que um passo — o editor devolve o HTML re-serializado a seguir a cada
// restauro, e esse UPDATE_CONTENT limpava o future e voltava a empilhar o estado desfeito.
export type ContentState = {
    fullHtml: string;
    activeChapterIndex: number;
    isLoadingChapter: boolean;
};

export type ContentAction =
    | { type: 'LOAD_CONTENT'; payload: string }
    | { type: 'UPDATE_CONTENT'; content: string; chapterIndex?: number }
    | { type: 'CHANGE_CHAPTER'; index: number }
    | { type: 'SET_LOADING'; loading: boolean }
    | { type: 'RESET' };

export const initialContentState: ContentState = {
    fullHtml: '',
    activeChapterIndex: -1,
    isLoadingChapter: false,
};

// Escreve o conteúdo de UM capítulo dentro do livro (índice -1 = o conteúdo já é o livro todo).
// `null` = o índice já não existe. Partilhado com o `getLatestHtmlContent` do useChapterSync,
// que precisa de aplicar uma edição ainda presa no debounce sem passar pelo reducer.
// `cleanedFullHtml`: opcional, evita repetir o cleanHeadings(fullHtml) quando o chamador já
// o tem em cache (useChapterSync.cleanHtmlCached) — sem isto, getLatestHtmlContent recomputava
// a limpeza do livro inteiro a cada chamada mesmo com o cache disponível.
export function replaceChapterContent(fullHtml: string, content: string, chapterIndex: number, cleanedFullHtml?: string): string | null {
    if (chapterIndex === -1) return content;
    const parts = (cleanedFullHtml ?? cleanHeadings(fullHtml)).split(CHAPTER_SPLIT_PATTERN).filter(p => p.trim().length > 0);
    if (parts[chapterIndex] === undefined) return null;
    parts[chapterIndex] = content;
    return cleanHeadings(parts.join(''));
}

export function contentReducer(state: ContentState, action: ContentAction): ContentState {
    switch (action.type) {
        case 'LOAD_CONTENT':
            return { ...state, fullHtml: action.payload, activeChapterIndex: -1 };

        case 'UPDATE_CONTENT': {
            // The content's origin chapter travels with the action: if the active chapter
            // changed between the debounce setup and this dispatch, falling back to
            // state.activeChapterIndex would overwrite the wrong chapter (duplicates).
            const targetIndex = action.chapterIndex ?? state.activeChapterIndex;
            const newFullHtml = replaceChapterContent(state.fullHtml, action.content, targetIndex);
            // Índice obsoleto (o capítulo foi eliminado/movido enquanto a edição esperava pelo
            // debounce): descartar a AÇÃO. Escrever o join na mesma fazia desaparecer a edição
            // em silêncio, e podia normalizar o livro por uma escrita que não valia.
            if (newFullHtml === null) return state;

            return { ...state, fullHtml: newFullHtml };
        }

        case 'CHANGE_CHAPTER':
            return { ...state, activeChapterIndex: action.index, isLoadingChapter: false };

        case 'SET_LOADING':
            return { ...state, isLoadingChapter: action.loading };

        case 'RESET':
            return initialContentState;

        default:
            return state;
    }
}
