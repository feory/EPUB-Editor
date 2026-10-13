// Interação do bloco (rato → ação): as decisões de useBlockOverlays sem DOM nem React — eventos já
// normalizados (coordenadas do iframe, retângulos) → resultado. Testável por sequências de eventos;
// o hook só liga estes resultados ao editor e ao estado de overlay.
import { PLUS_HIT, gripZoneAt, gripTop, nearGripLine, type GripZone } from './blockGeometry';

type Rect = { left: number; top: number; bottom: number };

/** O bloco de TOPO (filho direto do body) que contém `block` — o que se move/duplica/elimina. */
export function topLevelBlock(block: HTMLElement, body: HTMLElement): HTMLElement {
    let top = block;
    while (top.parentElement && top.parentElement !== body) top = top.parentElement;
    return top;
}

/** O clique caiu no círculo do "+" (centrado na borda inferior do bloco)? */
export const hitsPlus = (x: number, y: number, block: { left: number; width: number }, centerY: number) =>
    Math.abs(x - (block.left + block.width / 2)) <= PLUS_HIT && Math.abs(y - centerY) <= PLUS_HIT;

export interface GripState {
    top: number | null;       // topo da pega (coords do iframe) quando visível
    overGrip: boolean;        // rato em cima da pega → mini-menu escondido
}

/**
 * Pega do bloco ativo: aparece com o rato perto da linha esquerda (ou já em cima dela — não pode
 * desaparecer ao aproximar-se). `prevTop` = topo da pega no mousemove anterior. Sem bloco → escondida.
 */
export function gripState(
    mouse: { x: number; y: number }, block: Rect | null, prevTop: number | null, windowHeight: number,
): GripState {
    if (!block) return { top: null, overGrip: false };
    const onGrip = prevTop !== null && !!gripZoneAt(mouse.x, mouse.y, block.left, prevTop);
    const top = onGrip || nearGripLine(mouse.x, mouse.y, block) ? gripTop(block.top, block.bottom, 0, windowHeight) : null;
    return { top, overGrip: top !== null && !!gripZoneAt(mouse.x, mouse.y, block.left, top) };
}

export const gripZone = (mouse: { x: number; y: number }, blockLeft: number, top: number | null): GripZone | null =>
    top === null ? null : gripZoneAt(mouse.x, mouse.y, blockLeft, top);

/** Onde largar o bloco arrastado: antes/depois do bloco cujo ponto médio fica abaixo de `y` (último = depois). */
export function dropTargetAt(y: number, blocks: { top: number; bottom: number }[]): { index: number; pos: 'before' | 'after' } | null {
    if (!blocks.length) return null;
    let index = 0;
    let pos: 'before' | 'after' = 'before';
    for (let i = 0; i < blocks.length; i++) {
        index = i;
        if (y < (blocks[i].top + blocks[i].bottom) / 2) { pos = 'before'; break; }
        pos = 'after';
    }
    return { index, pos };
}

/** Evita setState repetido: `changed(key)` é true só quando a chave difere da última. */
export function changeDetector() {
    let last = '';
    return (key: string) => {
        if (key === last) return false;
        last = key;
        return true;
    };
}
