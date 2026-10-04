import type { TinyMCEEditor } from './types';

/**
 * Canal de conteúdo do editor: o ÚNICO caminho por onde o HTML entra no editor (`load`) e sai
 * dele (report para quem guarda o capítulo — useChapterSync).
 *
 * Entrada — `load(html, { undo })` com a política de undo EXPLÍCITA:
 *  - 'reset': carregamento (inicial, troca de capítulo) — o undo não pode trazer outro capítulo.
 *  - 'keep': transformação externa do livro (commitHtml) — reversível com Ctrl+Z.
 * Devolve o HTML tal como ficou no editor (reserializado pelo TinyMCE): é esse que o chamador
 * deve guardar. Conteúdo que o canal já conhece (eco de um report, ou o último load) não
 * volta a ser carregado — quem chama pode chamar load a cada mudança sem medo de ciclos.
 *
 * Saída — `editor.getContent()` (o livro inteiro serializado, ~130ms no Documento Completo) só
 * quando a escrita pára (DEFER_MS) nos eventos frequentes; imediato nos raros. `flush()`
 * reporta já o que estiver pendente: quem LÊ o conteúdo para gravar/trocar de capítulo chama-o
 * antes. `shouldReport` (realce do diff ativo) suspende os reports — o que muda nesse tempo só
 * é reportado na edição seguinte (como o isDiffHighlightingRef de sempre).
 */
export type UndoPolicy = 'reset' | 'keep';

export interface ContentChannel {
    load: (html: string, opts: { undo: UndoPolicy }) => string;
    flush: () => void;
}

export interface ContentChannelOptions {
    onReport: (html: string) => void;
    shouldReport?: () => boolean;
    // Limpeza do corpo depois de cada setContent (carregar, colar, inserir); devolve se mudou.
    // Num carregamento, se mudou, o canal reporta o HTML já limpo (o eco não recarrega).
    normalize?: () => boolean;
    deferMs?: number;
}

const DEFERRED_EVENTS = 'input change compositionend CommentChange';
const IMMEDIATE_EVENTS = 'SetContent NewBlock Undo Redo remove';

export function attachContentChannel(editor: TinyMCEEditor, { onReport, shouldReport = () => true, normalize, deferMs = 300 }: ContentChannelOptions): ContentChannel {
    let known: string | null = null;        // último HTML reportado ou carregado (serializado)
    let lastLoadedRaw: string | null = null; // o último html PASSADO a load (antes de reserializar)
    let loading = false;                     // os eventos do próprio load não são edições
    let normalizedInLoad = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const report = () => {
        clearTimeout(timer); timer = undefined;
        if (loading || !shouldReport()) return;
        const html = editor.getContent();
        if (html === known) return;
        known = html;
        onReport(html);
    };
    const defer = () => {
        if (loading) return;
        clearTimeout(timer);
        timer = setTimeout(report, deferMs);
    };
    // ANTES do report imediato do SetContent: o report (colar/inserir) já vê o DOM limpo.
    editor.on('SetContent', () => { if (normalize?.() && loading) normalizedInLoad = true; });
    editor.on(DEFERRED_EVENTS, defer);
    editor.on(IMMEDIATE_EVENTS, () => { if (!loading) report(); });

    const load = (html: string, { undo }: { undo: UndoPolicy }): string => {
        if (known !== null && (html === known || html === lastLoadedRaw)) return known;
        clearTimeout(timer); timer = undefined; // o pendente é do conteúdo que vai ser substituído
        loading = true;
        normalizedInLoad = false;
        try {
            if (undo === 'reset') {
                editor.setContent(html);
                editor.undoManager.clear();
                editor.undoManager.add();
                editor.setDirty(false);
            } else {
                // dom.setHTML (não setContent): igual ao syncExternalContent de sempre.
                editor.dom.setHTML(editor.getBody(), html);
                editor.undoManager.add();
                editor.dispatch('Change');
                editor.nodeChanged();
            }
        } finally {
            loading = false;
        }
        lastLoadedRaw = html;
        const loaded: string = editor.getContent();
        known = loaded;
        // A limpeza mudou o que veio de fora (ex. data-image-id): quem guarda tem de ficar com a
        // versão limpa. Nunca um vazio (o <p><br></p> inicial do TinyMCE não é conteúdo).
        if (normalizedInLoad && loaded.trim() && shouldReport()) onReport(loaded);
        return loaded;
    };

    return { load, flush: () => { if (timer !== undefined) report(); } };
}
