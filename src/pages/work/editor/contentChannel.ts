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
 * Saída — o livro serializado só quando a escrita pára (DEFER_MS) nos eventos frequentes;
 * imediato nos raros. `editor.getContent()` custa ~70–100ms no Documento Completo (1,6 MB), por
 * isso, entre dois reports, um MutationObserver regista que blocos de topo mudaram e só esses são
 * re-serializados (`serializer.serialize`); o resto reaproveita o texto do report anterior. O
 * TinyMCE separa os blocos de topo com '\n', por isso `blocks.join('\n')` === `getContent()`
 * (verificado num livro de 2548 blocos). Qualquer alteração de estrutura (blocos acrescentados,
 * removidos, movidos, undo, setContent) ou dúvida sobre o alinhamento cai no `getContent()`. `flush()`
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
    // Compara cada report incremental com o getContent() completo (só para diagnóstico: custa o
    // que o incremental poupa). Se divergir, regista o erro e usa o completo.
    verify?: boolean;
}

const DEFERRED_EVENTS = 'input change compositionend CommentChange';
const IMMEDIATE_EVENTS = 'SetContent NewBlock Undo Redo remove';

export function attachContentChannel(editor: TinyMCEEditor, { onReport, shouldReport = () => true, normalize, deferMs = 300, verify = false }: ContentChannelOptions): ContentChannel {
    let known: string | null = null;        // último HTML reportado ou carregado (serializado)
    let lastLoadedRaw: string | null = null; // o último html PASSADO a load (antes de reserializar)
    let loading = false;                     // os eventos do próprio load não são edições
    let normalizedInLoad = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // --- Serialização incremental (ver cabeçalho) ---
    const rootEl: HTMLElement | null = editor.getBody();
    const canTrack = typeof MutationObserver !== 'undefined' && rootEl?.nodeType === 1;
    let blocks: string[] | null = null;      // HTML de cada bloco de topo no último report completo
    let dirty = new Set<Element>();          // blocos de topo mexidos desde então
    let structural = true;                   // a estrutura de topo mudou → só o getContent serve
    const topBlockOf = (node: Node | null): Element | null => {
        while (node && node.parentNode !== rootEl) node = node.parentNode;
        return node?.nodeType === 1 ? (node as Element) : null;
    };
    const note = (records: MutationRecord[]) => {
        for (const r of records) {
            if (r.target === rootEl) { if (r.type === 'childList') structural = true; continue; }
            const top = topBlockOf(r.target);
            if (top) dirty.add(top); else structural = true; // mexeu num bloco que já saiu do corpo
        }
    };
    const observer = canTrack
        ? new MutationObserver(note)
        : null;
    observer?.observe(rootEl as HTMLElement, { childList: true, subtree: true, characterData: true, attributes: true });
    const aligned = () => !!rootEl && rootEl.childNodes.length === rootEl.children.length;
    // Serializa o livro todo e guarda os blocos (só se o split por '\n' bate com os filhos do corpo).
    const serializeAll = (): string => {
        const html: string = editor.getContent();
        if (observer && rootEl) {
            observer.takeRecords();
            const parts = html.split('\n');
            blocks = aligned() && parts.length === rootEl.children.length ? parts : null;
            structural = blocks === null;
            dirty = new Set();
        }
        return html;
    };
    const serialize = (): string => {
        if (!observer || !rootEl) return editor.getContent();
        note(observer.takeRecords());
        if (structural || !blocks || !aligned() || blocks.length !== rootEl.children.length) return serializeAll();
        const kids = Array.from(rootEl.children);
        const next = blocks.slice();
        for (const el of dirty) {
            const i = kids.indexOf(el);
            if (i < 0) return serializeAll();
            next[i] = editor.serializer.serialize(el, { format: 'html', getInner: false });
        }
        const html = next.join('\n');
        if (verify) {
            const full: string = editor.getContent();
            if (full !== html) { console.error('[contentChannel] report incremental diverge do completo'); return serializeAll(); }
        }
        blocks = next;
        dirty = new Set();
        return html;
    };

    const report = () => {
        clearTimeout(timer); timer = undefined;
        if (loading || !shouldReport()) return;
        const html = serialize();
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
        const loaded: string = serializeAll();
        known = loaded;
        // A limpeza mudou o que veio de fora (ex. data-image-id): quem guarda tem de ficar com a
        // versão limpa. Nunca um vazio (o <p><br></p> inicial do TinyMCE não é conteúdo).
        if (normalizedInLoad && loaded.trim() && shouldReport()) onReport(loaded);
        return loaded;
    };

    return { load, flush: () => { if (timer !== undefined) report(); } };
}
