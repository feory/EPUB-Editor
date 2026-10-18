/**
 * Pré-visualizar/exportar usavam getSyncedHtmlContent (só o reducer) e geravam o EPUB sem a edição
 * ainda presa no debounce. O hook recebe agora o getter "latest": o EPUB tem de trazer o texto acabado de digitar.
 */
import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { useReducer, useRef, act } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { contentReducer, initialContentState, type ContentAction } from '../contentReducer';
import { useChapterSync } from '../useChapterSync';

// file-saver (via epub-service) lê HTMLAnchorElement ao ser importado → globais ANTES do import.
const win = new Window();
Object.assign(globalThis, { window: win, document: win.document, DOMParser: win.DOMParser, NodeFilter: win.NodeFilter, HTMLAnchorElement: win.HTMLAnchorElement, IS_REACT_ACT_ENVIRONMENT: true });
const { useEbookExport } = await import('../useEbookExport');

const BOOK = '<p class="chapter-break-h1" data-title="Um"></p><h1>Um</h1><p>original um</p>';

test('handlePreview gera o EPUB com a edição que ainda está no debounce', async () => {
    let sync!: ReturnType<typeof useChapterSync>;
    let exp!: ReturnType<typeof useEbookExport>;
    let dispatch!: (a: ContentAction) => void;
    function Harness() {
        const [state, d] = useReducer(contentReducer, initialContentState);
        dispatch = d;
        const skip = useRef(false);
        sync = useChapterSync(state, d, skip);
        exp = useEbookExport({ isbn: undefined, ebook: undefined, getLatestHtmlContent: sync.getLatestHtmlContent, customCss: '', showNotification: () => {} });
        return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => { root.render(<Harness />); });
    act(() => { dispatch({ type: 'LOAD_CONTENT', payload: BOOK }); });
    act(() => { dispatch({ type: 'CHANGE_CHAPTER', index: 0 }); });
    act(() => { sync.handleEditorChange(BOOK.replace('original um', 'EDITADO AGORA MESMO')); });

    await act(async () => { await exp.handlePreview(); });

    const zip = await JSZip.loadAsync(await exp.previewBlob!.arrayBuffer());
    const texts = await Promise.all(Object.keys(zip.files).filter(f => f.endsWith('.xhtml')).map(f => zip.files[f].async('string')));
    expect(texts.join('')).toContain('EDITADO AGORA MESMO');
    act(() => root.unmount());
});
