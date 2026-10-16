/**
 * Menu aberto — dono de "qual menu flutuante do editor está aberto" (no máximo um).
 *
 * Os menus (inserção "+", pega, elemento ⋮, grelha, "Mais estilos") ocupam o mesmo sítio
 * e escondem outras peças enquanto abertos. Antes cada um tinha o seu estado e a exclusão estava
 * numa lista à mão; aqui abrir um fecha o outro e o que se esconde DERIVA do menu aberto:
 *  - mini-menu: escondido com o "+" (motivo 'plusMenu') e com a pega/elemento (motivo 'gripMenu');
 *  - botão "+": escondido com a pega/elemento (classe no body → contentStyles.ts, nunca :has());
 *  - bloco do "+": marcado (MARK.plusOpen) para o botão ficar visível sem :hover.
 * O que toca no editor entra por `MenuHost` (adapter), por isso testa-se sem TinyMCE.
 */
import type { ElementMenuState } from './overlays/BlockOverlays';

export type Pos = { top: number; left: number };

export type OpenMenu =
    | { kind: 'plus'; pos: Pos; block: HTMLElement }
    | { kind: 'grip'; pos: Pos }
    | { kind: 'element'; state: ElementMenuState }
    | { kind: 'grid'; state: Pos & { up: boolean } }
    | { kind: 'style'; state: Pos & { kind: 'para' | 'head' } };

export interface MenuHost {
    suppressMiniMenu(reason: 'plusMenu' | 'gripMenu', on: boolean): void;
    /** Classe `ps-grip-menu` no body do editor (esconde o botão "+"). */
    setGripMenuClass(on: boolean): void;
    markPlusBlock(block: HTMLElement, on: boolean): void;
    /** Reavaliar mini-menu e pega (voltam a aparecer quando o menu do "+" fecha). */
    reevaluate(): void;
}

const hidesPlusButton = (m: OpenMenu | null) => m?.kind === 'grip' || m?.kind === 'element';

export function createMenus(host: MenuHost, onChange: (menu: OpenMenu | null) => void) {
    let current: OpenMenu | null = null;

    function show(next: OpenMenu | null) {
        const prev = current;
        current = next;
        const wasPlus = prev?.kind === 'plus', isPlus = next?.kind === 'plus';
        if (wasPlus && (!isPlus || prev.block !== next.block)) host.markPlusBlock(prev.block, false);
        if (isPlus) host.markPlusBlock(next.block, true);
        if (wasPlus !== isPlus) host.suppressMiniMenu('plusMenu', isPlus);
        if (hidesPlusButton(prev) !== hidesPlusButton(next)) {
            host.suppressMiniMenu('gripMenu', hidesPlusButton(next));
            host.setGripMenuClass(hidesPlusButton(next));
        }
        if (wasPlus && !isPlus) host.reevaluate();
        onChange(next);
    }

    return {
        get current() { return current; },
        show,
        /** Fecha o menu aberto; com `kind`, só se for desse tipo. */
        close(kind?: OpenMenu['kind']) {
            if (current && (!kind || current.kind === kind)) show(null);
        },
    };
}

export type Menus = ReturnType<typeof createMenus>;
