/**
 * Bug reportado: "às vezes as alterações feitas não ficaram gravadas".
 *
 * useChapterSync já documenta (linhas 70-72) um bug PASSADO desta mesma família: escrever e
 * Guardar dentro da janela do debounce (800/1500ms) não gravava a última edição, porque
 * getSyncedHtmlContent lê só fullHtml — getLatestHtmlContent foi o fix, juntando a edição ainda
 * presa no debounce (localContentRef) via replaceChapterContent.
 *
 * Este teste prova, com o hook a correr de verdade (sem mocks de TinyMCE — só o estado/refs),
 * que a discrepância continua real: getSyncedHtmlContent() NÃO inclui uma edição acabada de
 * digitar, getLatestHtmlContent() inclui. Ver useEbookWork.test.tsx para os call-sites que
 * ainda chamam a versão errada.
 */
import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import { useReducer, useRef, type Dispatch } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { contentReducer, initialContentState, type ContentAction } from '../contentReducer';
import { useChapterSync } from '../useChapterSync';

beforeAll(() => {
    const win = new Window();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = win;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).document = win.document;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

function mountChapterSync() {
    let latestApi: ReturnType<typeof useChapterSync> | null = null;
    let latestDispatch: Dispatch<ContentAction> | null = null;

    function Harness() {
        const [state, dispatch] = useReducer(contentReducer, initialContentState);
        const skipSyncRef = useRef(false);
        latestApi = useChapterSync(state, dispatch, skipSyncRef);
        latestDispatch = dispatch;
        return null;
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => { root.render(<Harness />); });

    return {
        dispatch: (action: ContentAction) => act(() => { latestDispatch!(action); }),
        api: () => latestApi!,
        unmount: () => act(() => root.unmount()),
    };
}

const TWO_CHAPTERS =
    '<p class="chapter-break-h1" data-title="Um"></p><h1>Um</h1><p>original um</p>'
    + '<p class="chapter-break-h1" data-title="Dois"></p><h1>Dois</h1><p>original dois</p>';

test('getSyncedHtmlContent NÃO inclui edição ainda presa no debounce', () => {
    const h = mountChapterSync();
    h.dispatch({ type: 'LOAD_CONTENT', payload: TWO_CHAPTERS });
    h.dispatch({ type: 'CHANGE_CHAPTER', index: 0 });

    // Digitar (handleEditorChange) — atualiza localContentRef SINCRONAMENTE, antes de o timer
    // de debounce (800ms) sequer disparar. Nenhum setTimeout precisa de correr para este teste.
    act(() => { h.api().handleEditorChange(TWO_CHAPTERS.replace('original um', 'EDITADO AGORA MESMO')); });

    const synced = h.api().getSyncedHtmlContent();
    expect(synced).toContain('original um');
    expect(synced).not.toContain('EDITADO AGORA MESMO');
    h.unmount();
});

test('getLatestHtmlContent INCLUI a mesma edição pendente — a via correta antes de gravar/substituir', () => {
    const h = mountChapterSync();
    h.dispatch({ type: 'LOAD_CONTENT', payload: TWO_CHAPTERS });
    h.dispatch({ type: 'CHANGE_CHAPTER', index: 0 });

    act(() => { h.api().handleEditorChange(TWO_CHAPTERS.replace('original um', 'EDITADO AGORA MESMO')); });

    const latest = h.api().getLatestHtmlContent();
    expect(latest).toContain('EDITADO AGORA MESMO');
    expect(latest).not.toContain('original um');
    expect(latest).toContain('original dois'); // capítulo não editado preservado
    h.unmount();
});

// --- Documenta o bug encontrado e corrigido (useEbookWork.ts) ------------------------------
// 6 handlers (handleEditChapterTitle, getChaptersAndParts —usado por Reorder/ChangeLevel/
// Delete/Add—, handleApplyDropCaps, handleLinkIndiceEntries, handleFixLinks,
// handleGeneratePageList) liam via getSyncedHtmlContent() antes de um LOAD_CONTENT que
// substitui fullHtml inteiro — apagando silenciosamente uma edição ainda presa no debounce.
// Corrigido para getLatestHtmlContent() (o mesmo padrão já usado por saveContent/"Guardar",
// useEbookWork.ts:421-423). Os 2 testes abaixo trancam o padrão certo vs o anti-padrão.

test('ANTI-PADRÃO: getSyncedHtmlContent + LOAD_CONTENT apaga silenciosamente uma edição pendente', () => {
    const h = mountChapterSync();
    h.dispatch({ type: 'LOAD_CONTENT', payload: TWO_CHAPTERS });
    h.dispatch({ type: 'CHANGE_CHAPTER', index: 0 });
    act(() => { h.api().handleEditorChange(TWO_CHAPTERS.replace('original um', 'EDITADO AGORA MESMO')); });

    // Padrão exato de handleApplyDropCaps/handleLinkIndiceEntries/handleFixLinks/handleGeneratePageList
    // (useEbookWork.ts): ler getSyncedHtmlContent, "transformar" (aqui, no-op — já basta para
    // reproduzir a perda), e substituir fullHtml por inteiro.
    const stale = h.api().getSyncedHtmlContent();
    h.dispatch({ type: 'LOAD_CONTENT', payload: stale });

    const afterReplace = h.api().getSyncedHtmlContent();
    expect(afterReplace).not.toContain('EDITADO AGORA MESMO'); // ⚠ a edição desapareceu
    expect(afterReplace).toContain('original um');              // ⚠ o livro voltou ao estado pré-edição
    h.unmount();
});

test('PADRÃO CORRETO: getLatestHtmlContent + LOAD_CONTENT preserva a edição pendente', () => {
    const h = mountChapterSync();
    h.dispatch({ type: 'LOAD_CONTENT', payload: TWO_CHAPTERS });
    h.dispatch({ type: 'CHANGE_CHAPTER', index: 0 });
    act(() => { h.api().handleEditorChange(TWO_CHAPTERS.replace('original um', 'EDITADO AGORA MESMO')); });

    const fresh = h.api().getLatestHtmlContent();
    h.dispatch({ type: 'LOAD_CONTENT', payload: fresh });

    const afterReplace = h.api().getSyncedHtmlContent();
    expect(afterReplace).toContain('EDITADO AGORA MESMO');
    expect(afterReplace).not.toContain('original um');
    h.unmount();
});
