// Posição dos botões de eliminar sobre o editor (função pura: retângulos entram, botões saem).
// Regras: o botão fica no canto superior direito do elemento e acompanha-o — sem "sticky": esconde-se
// quando o canto sai da área visível. O do contentor (colunas/caixa) fica por cima dele, fora, para
// não tocar no do elemento; sem espaço por cima, desce para dentro e desloca-se para a esquerda.

export const BUTTON_SIZE = 24;
const INSET = 4;                 // folga ao canto
const GAP_ABOVE = 6;             // folga entre o botão do contentor e o topo do contentor
const SHIFT_LEFT = BUTTON_SIZE + INSET;

export interface Corner { top: number; right: number }   // retângulo do elemento, em coords do iframe
export interface DeleteButton { top: number; left: number; container: boolean }  // em coords da janela

export interface DeleteLayoutInput {
    item: Corner | null;
    container: Corner | null;
    iframe: { top: number; left: number; height: number };
    headerHeight: number;        // barra da app: o botão não pode ficar por baixo dela
    windowHeight: number;
}

export function layoutDeleteButtons({ item, container, iframe, headerHeight, windowHeight }: DeleteLayoutInput): DeleteButton[] {
    const visible = (top: number) =>
        top >= 0 && top <= iframe.height - BUTTON_SIZE
        && iframe.top + top >= headerHeight && iframe.top + top <= windowHeight - BUTTON_SIZE;
    const left = (right: number) => iframe.left + right - INSET - BUTTON_SIZE;
    const out: DeleteButton[] = [];
    if (item && visible(item.top + INSET)) out.push({ top: iframe.top + item.top + INSET, left: left(item.right), container: false });
    if (container) {
        const above = container.top - BUTTON_SIZE - GAP_ABOVE;
        if (visible(above)) out.push({ top: iframe.top + above, left: left(container.right), container: true });
        else if (above < 0 && visible(container.top + INSET)) out.push({ top: iframe.top + container.top + INSET, left: left(container.right) - SHIFT_LEFT, container: true });
    }
    return out;
}
