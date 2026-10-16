import { test, expect } from 'bun:test';
import { createMenus } from '../openMenu';
import type { OpenMenu } from '../openMenu';

function setup() {
    const log: string[] = [];
    const seen: Array<OpenMenu | null> = [];
    const block = { id: 'b' } as unknown as HTMLElement;
    const menus = createMenus({
        suppressMiniMenu: (r, on) => log.push(`mini:${r}:${on}`),
        setGripMenuClass: (on) => log.push(`class:${on}`),
        markPlusBlock: (_, on) => log.push(`mark:${on}`),
        reevaluate: () => log.push('reeval'),
    }, (m) => seen.push(m));
    return { menus, log, seen, block };
}

const pos = { top: 1, left: 2 };

test('"+" aberto: esconde o mini-menu e marca o bloco; fechar repõe e reavalia', () => {
    const { menus, log, block } = setup();
    menus.show({ kind: 'plus', pos, block });
    expect(log).toEqual(['mark:true', 'mini:plusMenu:true']);
    log.length = 0;
    menus.close('plus');
    expect(log).toEqual(['mark:false', 'mini:plusMenu:false', 'reeval']);
    expect(menus.current).toBeNull();
});

test('pega e elemento escondem mini-menu e "+" (classe no body); grelha e estilos não escondem nada', () => {
    const { menus, log } = setup();
    menus.show({ kind: 'grip', pos });
    expect(log).toEqual(['mini:gripMenu:true', 'class:true']);
    log.length = 0;
    menus.show({ kind: 'grid', state: { ...pos, up: false } }); // substitui: o "+" volta
    expect(log).toEqual(['mini:gripMenu:false', 'class:false']);
    log.length = 0;
    menus.show({ kind: 'style', state: { ...pos, kind: 'para' } });
    expect(log).toEqual([]);
});

test('abrir um menu fecha o outro: de "+" para pega repõe o "+" e esconde o resto', () => {
    const { menus, log, block } = setup();
    menus.show({ kind: 'plus', pos, block });
    log.length = 0;
    menus.show({ kind: 'grip', pos });
    expect(log).toEqual(['mark:false', 'mini:plusMenu:false', 'mini:gripMenu:true', 'class:true', 'reeval']);
    expect(menus.current?.kind).toBe('grip');
});

test('close(kind) ignora outro tipo; close() fecha qualquer; sem menu não faz nada', () => {
    const { menus, seen } = setup();
    menus.close();
    expect(seen).toEqual([]);
    menus.show({ kind: 'grip', pos });
    menus.close('plus');
    expect(menus.current?.kind).toBe('grip');
    menus.close();
    expect(menus.current).toBeNull();
    expect(seen.length).toBe(2);
});

test('pega → elemento: continua escondido, sem repor e esconder de novo', () => {
    const { menus, log } = setup();
    menus.show({ kind: 'grip', pos });
    log.length = 0;
    menus.show({ kind: 'element', state: { ...pos, up: false, hasStyles: false, boxed: false, container: null } });
    expect(log).toEqual([]);
});
