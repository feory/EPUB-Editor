// Marcas efémeras de UI do editor: vivem no DOM do iframe mas NUNCA no conteúdo gravado/exportado
// (o serializer não as emite — addTempAttr). Único dono dos nomes e do registo; o CSS (contentStyles.ts,
// blockGeometry.ts) e o JS importam daqui em vez de repetir as strings.

// Atributos do bloco/elemento.
export const MARK = {
    active: 'data-mce-psactive',      // bloco ativo (activeBlock.ts): anel, "+", pega
    plusOpen: 'data-mce-plusopen',    // menu de inserção aberto: o "+" fica visível sem :hover
    box: 'data-mce-psbox',            // caixa/grelha selecionada pelo clique na sua área
    empty: 'data-mce-empty',          // placeholder do parágrafo vazio focado
    htmlEdit: 'data-mce-htmledit',    // bloco escondido durante a edição de HTML inline
} as const;

// Classes do <body> do iframe (também não entram no conteúdo gravado).
export const BODY_CLASS = {
    hasActive: 'ps-has-active',       // há bloco ativo (em vez de :has(), lento com milhares de blocos)
    gripNear: 'ps-grip-near',         // rato perto da linha da pega
    gripMenu: 'ps-grip-menu',         // menu da pega / do elemento aberto
    boxSelected: 'ps-box-selected',   // caixa selecionada: esconde o anel do parágrafo
} as const;

interface EditorLike {
    on(name: string, cb: () => void): unknown;
    serializer: { addTempAttr(name: string): void };
    dom: { select(selector: string): Element[]; setAttrib(el: Element, name: string, value: string | null): void };
}

// Regista os atributos no serializer e limpa os que vieram no conteúdo carregado.
export function registerEphemeralMarks(editor: EditorLike) {
    editor.on('PreInit', () => Object.values(MARK).forEach(name => editor.serializer.addTempAttr(name)));
    editor.on('init', () => {
        for (const name of Object.values(MARK)) editor.dom.select(`[${name}]`).forEach(el => editor.dom.setAttrib(el, name, null));
    });
}
