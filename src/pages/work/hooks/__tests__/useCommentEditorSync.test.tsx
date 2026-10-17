/**
 * Rascunho de comentário: a âncora (sublinhado) já está no texto antes de haver comentário.
 * Sem comentário escrito não pode ficar sublinhado — cancelar, fechar o painel ou começar outro
 * rascunho tira-a; só "Comentar" a mantém. Hook a correr de verdade, editor falso.
 */
import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useCommentEditorSync } from '../useCommentEditorSync';

beforeAll(() => {
    const win = new Window();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = win;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).document = win.document;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

function mount({ inEditor = true, open = true } = {}) {
    const log: string[] = [];
    let api!: ReturnType<typeof useCommentEditorSync>;
    let setOpen!: (v: boolean) => void;
    let draft: string | null = null;
    const editorRef = {
        current: {
            removeCommentAnchor: (id: string) => { log.push(`editor:${id}`); return inEditor; },
            setCommentResolved: () => {},
        },
    };

    function Harness() {
        const [commentsOpen, setCommentsOpen] = useState(open);
        setOpen = setCommentsOpen;
        api = useCommentEditorSync({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            editorRef: editorRef as any,
            threads: [], resolveComment: () => {}, deleteComment: () => {},
            addComment: (c) => { log.push(`add:${c.anchorId}:${c.text}:${c.parentId ?? ''}`); }, commentsOpen,
            fullHtmlContent: '', activeChapterIndex: -1, setActiveChapterIndex: () => {},
            saveContentSilently: () => { log.push('save'); },
            removeAnchorFromBook: (id) => { log.push(`book:${id}`); },
        });
        draft = api.draftAnchorId;
        return null;
    }

    const root = createRoot(document.createElement('div'));
    act(() => { root.render(<Harness />); });
    return {
        log, api: () => api, draft: () => draft,
        setOpen: (v: boolean) => act(() => setOpen(v)),
        act: (fn: () => void) => act(fn),
        unmount: () => act(() => root.unmount()),
    };
}

test('cancelar rascunho: tira a âncora do editor, grava e limpa o rascunho', () => {
    const h = mount();
    h.act(() => h.api().startDraft('a1'));
    expect(h.draft()).toBe('a1');
    h.act(() => h.api().cancelDraft());
    expect(h.log).toEqual(['editor:a1', 'save']);
    expect(h.draft()).toBeNull();
    h.unmount();
});

test('cancelar com a âncora noutro capítulo (não montada): tira-a do HTML do livro', () => {
    const h = mount({ inEditor: false });
    h.act(() => h.api().startDraft('a1'));
    h.act(() => h.api().cancelDraft());
    expect(h.log).toEqual(['editor:a1', 'book:a1']);
    h.unmount();
});

test('começar outro rascunho tira a âncora do anterior, mesmo com o callback guardado do 1.º render', () => {
    const h = mount();
    const startFromFirstRender = h.api().startDraft; // o editor guarda-o no init e nunca o troca
    h.act(() => startFromFirstRender('a1'));
    h.act(() => startFromFirstRender('a2'));
    expect(h.log).toEqual(['editor:a1', 'save']);
    expect(h.draft()).toBe('a2');
    expect(h.api().startDraft).toBe(startFromFirstRender); // identidade estável
    h.unmount();
});

test('fechar o painel com rascunho aberto tira a âncora; sem rascunho não faz nada', () => {
    const h = mount();
    h.setOpen(false); // sem rascunho
    expect(h.log).toEqual([]);
    h.setOpen(true);
    h.act(() => h.api().startDraft('a1'));
    h.setOpen(false);
    expect(h.log).toEqual(['editor:a1', 'save']);
    expect(h.draft()).toBeNull();
    h.unmount();
});

test('o mesmo rascunho recomeçado não se apaga a si próprio', () => {
    const h = mount();
    h.act(() => h.api().startDraft('a1'));
    h.act(() => h.api().startDraft('a1'));
    expect(h.log).toEqual([]);
    expect(h.draft()).toBe('a1');
    h.unmount();
});

test('Comentar: envia o texto na âncora do rascunho e mantém a âncora no texto', () => {
    const h = mount();
    h.act(() => h.api().startDraft('a1'));
    h.act(() => h.api().submitDraft('olá'));
    expect(h.log).toEqual(['add:a1:olá:']);
    expect(h.draft()).toBeNull();
    h.unmount();
});

test('responder: envia com o id da raiz', () => {
    const h = mount();
    h.act(() => h.api().reply('a1', 7, 'ok'));
    expect(h.log).toEqual(['add:a1:ok:7']);
    h.unmount();
});
