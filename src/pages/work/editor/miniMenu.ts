import type { TinyMCEEditor } from './types';

/**
 * Mini-menu (ver Design/CONTEXT.md): a barra de estilos do bloco ativo — o `.tox-pop` do
 * context toolbar do TinyMCE — encostada à linha da borda do bloco, em cima ou (sem espaço)
 * em baixo, alinhada à esquerda.
 *
 * Este módulo é o ÚNICO que escreve no pop. O TinyMCE posiciona-o à maneira dele (centrado,
 * com folga para a seta, às vezes por dentro do bloco) e auto-flipa sem knob; aqui corrige-se
 * depois de cada mudança dele (observer do aux), a cada scroll e quando o editor muda de
 * posição/largura. Quem precisa de o esconder pede por motivo (`suppress`) — nunca mexe
 * no `style.visibility` diretamente.
 *
 * Regras internas (cada uma veio de um bug — ver testes em __tests__/miniMenu.test.ts):
 * - `style.top/left` são relativos ao contentor posicionado (`.tox-tinymce-aux`, no fim da
 *   página), não à janela → converter.
 * - O TinyMCE ancora por `bottom`/`right` nalguns layouts: com o nosso top/left o pop ficava
 *   esmagado (altura a encolher até 0) → limpar antes de medir.
 * - Medir com `left:0`: perto da direita o pop encolhe ao espaço que sobra.
 * - Clamp à direita pelo contentor, não pela janela (com a janela entrava em ciclo).
 * - As nossas escritas nunca redisparam o observer (`takeRecords`) — houve um ciclo infinito.
 * - Comparar com o destino (`style.top`), não com a posição no ecrã (animação do TinyMCE).
 * - Dropdowns abertos DESTE menu (¶, alinhamento) acompanham as deslocações; os da barra
 *   principal (também `.tox-menu` no aux) não.
 * - Seleção de texto: o pop é a barra de seleção, não se mexe (só a toolbar/pega o escondem).
 */

/** Motivos de fora para esconder o mini-menu. ('toolbar' é interno: o módulo ouve o hover.) */
export type MiniMenuSuppressReason = 'grip' | 'plusMenu';
type Reason = MiniMenuSuppressReason | 'toolbar';

export interface MiniMenu {
    /** Esconde (on) / deixa de esconder (off) por um motivo. Só reaparece sem motivos ativos. */
    suppress: (reason: MiniMenuSuppressReason, on: boolean) => void;
}

// Escondem também a barra de seleção de texto (o pop é o mesmo); 'plusMenu' só o mini-menu.
const HIDES_SELECTION_BAR: ReadonlySet<Reason> = new Set<Reason>(['toolbar', 'grip']);

// Anel do bloco ativo: 4px fora da caixa do bloco (contentStyles.ts) — o menu encosta a ele.
const RING = 4;

/**
 * Cabe ACIMA do bloco, senão ABAIXO, senão null (esconder). Ambos os lados medidos dentro da
 * área visível do iframe (`iframeTop`/`iframeHeight`), nunca da janela.
 */
function placeVertically(
    blockTop: number, blockBottom: number, blockVisible: boolean,
    popHeight: number, iframeTop: number, iframeHeight: number,
): { top: number; side: 'top' | 'bottom' } | null {
    if (!blockVisible) return null;
    const above = blockTop - popHeight - RING;
    if (above >= iframeTop + 4) return { top: above, side: 'top' };
    // Em baixo também encostado à linha. O "+" (centro da borda) só fica tapado em blocos
    // estreitos: o menu está alinhado à esquerda e acaba antes do centro nos normais.
    const below = blockBottom + RING;
    if (below + popHeight <= iframeTop + iframeHeight - 4) return { top: below, side: 'bottom' };
    return null;
}

const popOf = () => document.querySelector('.tox-tinymce-aux .tox-pop') as HTMLElement | null;
const iframeOf = (editor: TinyMCEEditor) =>
    (editor.getContainer()?.querySelector('iframe') as HTMLIFrameElement | null);

export function attachMiniMenu(
    editor: TinyMCEEditor,
    { blockOf }: { blockOf: (n: Node | null) => Element | null },
): MiniMenu {
    const reasons = new Set<Reason>();
    // Última posição (coords da janela) em que NÓS pusemos o menu — base para deslocar os
    // dropdowns dele. Não a posição atual do pop: o TinyMCE pode tê-lo acabado de mover.
    let lastPos: { top: number; left: number } | null = null;

    const shiftOpenMenus = (dx: number, dy: number) => {
        if (!dx && !dy) return;
        document.querySelectorAll<HTMLElement>('.tox-tinymce-aux .tox-menu').forEach((m) => {
            if (m.style.top) m.style.top = parseFloat(m.style.top) + dy + 'px';
            if (m.style.bottom) m.style.bottom = parseFloat(m.style.bottom) - dy + 'px';
            if (m.style.left) m.style.left = parseFloat(m.style.left) + dx + 'px';
        });
    };

    const writeIfChanged = (pop: HTMLElement, prop: 'top' | 'left', value: number) => {
        const current = parseFloat(pop.style[prop]);
        if (Number.isNaN(current) || Math.abs(current - value) >= 0.5) { pop.style[prop] = value + 'px'; return true; }
        return false;
    };

    const placeNow = () => {
        const pop = popOf();
        if (!pop || !pop.offsetHeight) return; // ausente/escondido pelo TinyMCE
        if ([...reasons].some((r) => HIDES_SELECTION_BAR.has(r))) { pop.style.visibility = 'hidden'; return; }
        if (!editor.selection.isCollapsed()) return; // seleção de texto → barra de seleção, não mexer
        if (reasons.size) { pop.style.visibility = 'hidden'; return; }
        // blockOf não inclui 'li' (pega/"+" não se estendem a listas) — mas o mini-menu sim.
        const selNode = editor.selection.getNode();
        const block = (blockOf(selNode) || editor.dom.getParent(selNode, 'li')) as HTMLElement | null;
        if (!block || !/^(P|H[1-6]|LI)$/.test(block.nodeName)) return;
        const iframe = iframeOf(editor);
        if (!iframe) return;
        const ir = iframe.getBoundingClientRect();
        const br = block.getBoundingClientRect();
        const parentRect = (pop.offsetParent as HTMLElement | null)?.getBoundingClientRect();

        pop.style.bottom = '';
        pop.style.right = '';
        pop.style.left = '0px'; // medir a largura/altura naturais
        const placed = placeVertically(ir.top + br.top, ir.top + br.bottom, br.top < ir.height && br.bottom > 0,
            pop.offsetHeight, ir.top, ir.height);

        if (!placed) {
            pop.style.visibility = 'hidden'; // não cabe em lado nenhum
            // Fechar um dropdown dele que esteja aberto (ficaria a flutuar sozinho): o TinyMCE não
            // expõe "fechar"; o 2.º clique no botão faz toggle. O foco estava no dropdown: sem o
            // devolver, o TinyMCE (focusout) fechava o mini-menu de vez. preventScroll: o bloco
            // está fora de vista, não saltar para o cursor.
            const openBtn = pop.querySelector('.tox-tbtn[aria-expanded="true"]') as HTMLElement | null;
            if (openBtn) {
                openBtn.click();
                editor.getBody().focus({ preventScroll: true });
            }
            lastPos = null;
            return;
        }

        pop.style.visibility = '';
        if (writeIfChanged(pop, 'top', placed.top - (parentRect?.top ?? 0))) {
            pop.classList.remove(placed.side === 'top' ? 'tox-pop--top' : 'tox-pop--bottom');
            pop.classList.add(placed.side === 'top' ? 'tox-pop--bottom' : 'tox-pop--top');
        }
        const maxLeft = (parentRect ? parentRect.right : window.innerWidth) - pop.offsetWidth - 4;
        const viewLeft = Math.max(4, Math.min(ir.left + br.left - RING, maxLeft));
        if (lastPos && pop.querySelector('.tox-tbtn[aria-expanded="true"]')) {
            shiftOpenMenus(viewLeft - lastPos.left, placed.top - lastPos.top);
        }
        lastPos = { top: placed.top, left: viewLeft };
        pop.style.left = viewLeft - (parentRect?.left ?? 0) + 'px';
    };

    const place = () => {
        placeNow();
        auxObserver.takeRecords(); // as nossas escritas não redisparam o observer
    };
    const auxObserver = new MutationObserver(place);
    const resizeObserver = new ResizeObserver(() => place());

    const setReason = (reason: Reason, on: boolean) => {
        if (on === reasons.has(reason)) return; // sem mudança → nada (clearGrip chama isto a miúdo)
        if (on) { reasons.add(reason); place(); return; }
        reasons.delete(reason);
        if (reasons.size) { place(); return; }
        // Último motivo saiu: repor já (a barra de seleção não passa por place) e pedir ao
        // TinyMCE que relance o menu — nem sempre o faz sozinho com o pop só escondido.
        const pop = popOf();
        if (pop) pop.style.visibility = '';
        place();
        editor.nodeChanged();
    };

    const onScroll = () => place();
    editor.on('init', () => {
        editor.getWin().addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('scroll', onScroll, true); // capture: scroll de qualquer contentor externo
        resizeObserver.observe(editor.getContainer()); // ex. barra lateral recolhida
        // Hover na barra principal: o mini-menu fica por baixo dela, sobreposto → esconder.
        // Retry: o cabeçalho/aux podem ainda não existir no exato instante do 'init'.
        const attachHeaderHover = () => {
            const header = editor.getContainer()?.querySelector('.tox-editor-header') as HTMLElement | null;
            if (!header) return false;
            header.addEventListener('mouseenter', () => setReason('toolbar', true));
            header.addEventListener('mouseleave', () => setReason('toolbar', false));
            return true;
        };
        if (!attachHeaderHover()) setTimeout(attachHeaderHover, 0);
        const attachAux = () => {
            const aux = document.querySelector('.tox-tinymce-aux');
            if (!aux) return false;
            auxObserver.observe(aux, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
            return true;
        };
        if (!attachAux()) setTimeout(attachAux, 0);
    });
    editor.on('remove', () => {
        editor.getWin()?.removeEventListener('scroll', onScroll);
        window.removeEventListener('scroll', onScroll, true);
        resizeObserver.disconnect();
        auxObserver.disconnect();
    });

    return { suppress: (reason, on) => setReason(reason, on) };
}
