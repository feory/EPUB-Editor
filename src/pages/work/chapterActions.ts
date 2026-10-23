import type { Level } from './bookEdit';

/**
 * O que se pode fazer a um capítulo a partir da Estrutura (painel lateral e modal do TOC). O hook devolve um objeto
 * estável; as duas superfícies recebem-no inteiro, por isso uma ação nova aparece nas duas.
 */
export interface ChapterActions {
    rename(index: number, title: string): void;
    reorder(from: number, to: number): void;
    changeLevel(index: number, level: Level): void;
    remove(index: number): void;
    duplicate(index: number): void;
    add(): void;
}
