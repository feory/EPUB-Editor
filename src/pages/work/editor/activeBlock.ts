import type { TinyMCEEditor } from './types';

/**
 * Bloco ativo (ver Design/CONTEXT.md): o parágrafo/título onde está o cursor, com o editor
 * focado, salvo se **recolhido** (2.º clique no mesmo bloco). Tem o anel; é o único com "+"
 * e pega; o Mini-menu aparece nele.
 *
 * Único dono deste estado: decide-o a cada NodeChange e escreve as marcas que o CSS lê
 * (`data-mce-psactive` no bloco, `ps-has-active` no body — contentStyles.ts). Quem precisa
 * de saber pergunta aqui, não reconstrói a resposta (nem a procura no DOM: o TinyMCE clona o
 * atributo para os <p> criados com Enter).
 *
 * A resposta é a do último NodeChange (não calculada ao vivo) — coincide sempre com o anel no
 * ecrã. O handler vai à FRENTE dos outros NodeChange: quem reage a seguir (pega, ...) já vê
 * a resposta nova, sem depender da ordem de registo.
 */
export interface ActiveBlock {
    /** O bloco ativo marcado no último NodeChange; null sem foco, recolhido ou fora de bloco. */
    current: () => HTMLElement | null;
    /** Este bloco foi recolhido (2.º clique)? Os critérios do Mini-menu usam isto. */
    isCollapsed: (block: Element | null) => boolean;
}

export function attachActiveBlock(
    editor: TinyMCEEditor,
    { blockOf }: { blockOf: (n: Node | null) => Element | null },
): ActiveBlock {
    let current: HTMLElement | null = null;
    let collapsed: Element | null = null;
    let prevClicked: Element | null = null;

    // 2.º clique no mesmo bloco: recolhe / volta a mostrar. Clique noutro bloco desfaz.
    editor.on('click', (e: MouseEvent) => {
        const block = blockOf(e.target as Node);
        if (block && block === prevClicked) {
            collapsed = collapsed === block ? null : block;
            editor.nodeChanged(); // a seleção não se move → forçar reavaliação
        } else {
            collapsed = null; // bloco novo: o NodeChange natural do clique já reavalia
        }
        prevClicked = block;
    });

    // Marcador de UI puro: o serializer nunca o emite (getContent/autosave/EPUB saem limpos).
    editor.on('PreInit', () => editor.serializer.addTempAttr('data-mce-psactive'));
    const clearMarks = () => editor.dom.select('[data-mce-psactive]')
        .forEach((el: HTMLElement) => editor.dom.setAttrib(el, 'data-mce-psactive', null));
    editor.on('init', clearMarks); // marcadores que vieram no conteúdo carregado

    editor.on('NodeChange', () => {
        // Limpar TODOS (não só o anterior): Enter no início de um bloco marcado clona o atributo.
        clearMarks();
        current = null;
        // Só com foco real — colocação programática do cursor (entrada/troca de capítulo) não conta.
        if (editor.hasFocus()) {
            const block = blockOf(editor.selection.getNode()) as HTMLElement | null;
            if (block && block !== collapsed && block !== editor.getBody()) {
                // Margens do bloco (citação, recuo inline) antes de a regra do anel as sobrepor:
                // o CSS compensa o padding a partir delas em vez de as zerar.
                const cs = editor.getWin().getComputedStyle(block);
                const bs = editor.getBody().style;
                bs.setProperty('--ps-ml', cs.marginLeft);
                bs.setProperty('--ps-mr', cs.marginRight);
                editor.dom.setAttrib(block, 'data-mce-psactive', '1');
                current = block;
            }
        }
        // Classe em vez de body:has([data-mce-psactive]): com milhares de blocos o :has era
        // reavaliado a cada nó inserido/removido (dropdown de estilos ~1,4s → ~25ms).
        // toggle com force não mexe no DOM se o estado não mudou.
        editor.getBody().classList.toggle('ps-has-active', !!current);
    }, true);

    return {
        current: () => current,
        isCollapsed: (block) => !!block && block === collapsed,
    };
}
