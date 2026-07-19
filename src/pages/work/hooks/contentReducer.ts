import { cleanHeadings, CHAPTER_SPLIT_PATTERN } from '../../../utils/html-cleaner';

export type ContentState = {
    fullHtml: string;
    activeChapterIndex: number;
    isLoadingChapter: boolean;
    past: string[];
    future: string[];
};

export type ContentAction =
    | { type: 'LOAD_CONTENT'; payload: string }
    | { type: 'UPDATE_CONTENT'; content: string; addToHistory?: boolean; chapterIndex?: number }
    | { type: 'CHANGE_CHAPTER'; index: number }
    | { type: 'SET_LOADING'; loading: boolean }
    | { type: 'UNDO' }
    | { type: 'REDO' }
    | { type: 'RESET' };

export const MAX_HISTORY_SIZE = 50;

export const initialContentState: ContentState = {
    fullHtml: '',
    activeChapterIndex: -1,
    isLoadingChapter: false,
    past: [],
    future: [],
};

export function contentReducer(state: ContentState, action: ContentAction): ContentState {
    switch (action.type) {
        case 'LOAD_CONTENT':
            return { ...state, fullHtml: action.payload, activeChapterIndex: -1, past: [], future: [] };

        case 'UPDATE_CONTENT': {
            let newFullHtml: string;

            // The content's origin chapter travels with the action: if the active chapter
            // changed between the debounce setup and this dispatch, falling back to
            // state.activeChapterIndex would overwrite the wrong chapter (duplicates).
            const targetIndex = action.chapterIndex ?? state.activeChapterIndex;
            if (targetIndex === -1) {
                newFullHtml = action.content;
            } else {
                const cleanedBase = cleanHeadings(state.fullHtml);
                const parts = cleanedBase.split(CHAPTER_SPLIT_PATTERN).filter(p => p.trim().length > 0);
                if (parts[targetIndex] !== undefined) {
                    parts[targetIndex] = action.content;
                }
                newFullHtml = cleanHeadings(parts.join(''));
            }

            const shouldAddToHistory = action.addToHistory !== false;
            if (shouldAddToHistory && newFullHtml !== state.fullHtml) {
                return {
                    ...state,
                    fullHtml: newFullHtml,
                    past: [...state.past.slice(-MAX_HISTORY_SIZE + 1), state.fullHtml],
                    future: [],
                };
            }
            return { ...state, fullHtml: newFullHtml };
        }

        case 'UNDO': {
            if (state.past.length === 0) return state;
            const previous = state.past[state.past.length - 1];
            return {
                ...state,
                fullHtml: previous,
                past: state.past.slice(0, -1),
                future: [state.fullHtml, ...state.future.slice(0, MAX_HISTORY_SIZE - 1)],
            };
        }

        case 'REDO': {
            if (state.future.length === 0) return state;
            const next = state.future[0];
            return {
                ...state,
                fullHtml: next,
                past: [...state.past.slice(-MAX_HISTORY_SIZE + 1), state.fullHtml],
                future: state.future.slice(1),
            };
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
