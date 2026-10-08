// Posição do botão "⋮" do elemento selecionado (função pura: retângulos entram, posição sai).
// Fica no canto superior direito do elemento e acompanha-o — sem "sticky": esconde-se quando o canto
// sai da área visível do editor, da janela ou fica sob a barra da app.

export const BUTTON_SIZE = 24;
const INSET = 4; // folga ao canto

export interface MenuButtonInput {
    item: { top: number; right: number };            // retângulo do elemento, em coords do iframe
    iframe: { top: number; left: number; height: number };
    headerHeight: number;                              // barra da app: o botão não pode ficar por baixo dela
    windowHeight: number;
}

export function layoutMenuButton({ item, iframe, headerHeight, windowHeight }: MenuButtonInput): { top: number; left: number } | null {
    const top = item.top + INSET;
    const visible = top >= 0 && top <= iframe.height - BUTTON_SIZE
        && iframe.top + top >= headerHeight && iframe.top + top <= windowHeight - BUTTON_SIZE;
    return visible ? { top: iframe.top + top, left: iframe.left + item.right - INSET - BUTTON_SIZE } : null;
}

export const BAR_HEIGHT = 48; // = mini-menu do TinyMCE (botões de 36px + 6px de padding)

const BAR_RING = 4; // folga entre a barra e a borda da caixa (= RING do anel do mini-menu)

/**
 * Barra da caixa selecionada (mini-menu da caixa): sempre EM CIMA da caixa, alinhada à esquerda, como o
 * mini-menu dos blocos. Sem espaço por cima (scroll) fica presa ao limite visível (`topBound`, coords da
 * janela) enquanto a caixa tiver parte à vista; esconde-se quando a caixa saiu ou já não sobra caixa por baixo.
 */
export function layoutBoxBar({ item, iframe, topBound, windowHeight }: {
    item: { top: number; bottom: number; left: number };   // retângulo da caixa, em coords do iframe
    iframe: MenuButtonInput['iframe'];
    topBound: number;                                       // topo visível (iframe ou fundo da barra principal)
    windowHeight: number;
}): { top: number; left: number } | null {
    if (item.bottom <= 0 || item.top >= iframe.height) return null; // caixa fora de vista
    const top = Math.max(iframe.top + item.top - BAR_HEIGHT - BAR_RING, Math.max(iframe.top, topBound) + 4);
    if (top >= iframe.top + item.bottom - BAR_RING) return null;    // preso mas já sem caixa por baixo
    if (top + BAR_HEIGHT > Math.min(iframe.top + iframe.height, windowHeight) - 4) return null;
    return { top, left: iframe.left + item.left - BAR_RING };
}

export const GRID_PLUS_SIZE = 24;

/**
 * "+" interno da grelha: no centro se estiver vazia; senão sobre a borda inferior, a meio (dentro do
 * padding da caixa). Escondido se o ponto não está na área visível.
 */
export function layoutGridPlus({ grid, empty, iframe, headerHeight, windowHeight }: {
    grid: { top: number; bottom: number; left: number; right: number }; empty: boolean;
    iframe: MenuButtonInput['iframe']; headerHeight: number; windowHeight: number;
}): { top: number; left: number } | null {
    const half = GRID_PLUS_SIZE / 2;
    const top = (empty ? (grid.top + grid.bottom) / 2 : grid.bottom + 2) - half;
    const visible = top >= 0 && top <= iframe.height - GRID_PLUS_SIZE
        && iframe.top + top >= headerHeight && iframe.top + top <= windowHeight - GRID_PLUS_SIZE;
    return visible ? { top: iframe.top + top, left: iframe.left + (grid.left + grid.right) / 2 - half } : null;
}

export const HANDLE_SIZE = 24;

/**
 * Pega "selecionar a grelha/caixa" à volta do cursor: na margem esquerda do contentor, junto ao topo
 * (longe do mini-menu, que fica por cima, e do "⋮", que fica no canto direito do elemento).
 * Sem margem à esquerda, fica dentro do contentor, encostada à borda.
 */
export function layoutParentHandle({ container, iframe, headerHeight, windowHeight }: {
    container: { top: number; left: number };
    iframe: MenuButtonInput['iframe']; headerHeight: number; windowHeight: number;
}): { top: number; left: number } | null {
    const top = container.top + INSET;
    const visible = top >= 0 && top <= iframe.height - HANDLE_SIZE
        && iframe.top + top >= headerHeight && iframe.top + top <= windowHeight - HANDLE_SIZE;
    if (!visible) return null;
    const left = container.left - HANDLE_SIZE - INSET;
    return { top: iframe.top + top, left: iframe.left + (left >= 0 ? left : container.left + INSET) };
}
