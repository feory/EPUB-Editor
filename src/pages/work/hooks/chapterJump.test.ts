import { test, expect } from 'bun:test';
import { chapterOwning, locateParagraph, scrollInChapter, type ChapterPorts } from './chapterJump';

test('chapterOwning: o capítulo cujo HTML tem o marcador, ou -1', () => {
    const parts = ['<p>a</p>', '<span data-page="7"></span><p>b</p>', '<img data-image-id="c1">'];
    expect(chapterOwning(parts, 'data-page="7"')).toBe(1);
    expect(chapterOwning(parts, 'data-image-id="c1"')).toBe(2);
    expect(chapterOwning(parts, 'data-page="99"')).toBe(-1);
});

test('locateParagraph: o parágrafo do livro inteiro vira (capítulo, índice local)', () => {
    const count = (p: string) => p.length; // 2, 0, 3 parágrafos
    const parts = ['ab', '', 'cde'];
    expect([0, 1, 2, 3, 4].map((n) => locateParagraph(parts, n, count))).toEqual([
        { chapter: 0, local: 0 }, { chapter: 0, local: 1 },
        { chapter: 2, local: 0 }, { chapter: 2, local: 1 }, { chapter: 2, local: 2 },
    ]);
    expect(locateParagraph(parts, 5, count)).toBeNull();
    expect(locateParagraph([], 0, count)).toBeNull();
});

/** Um editor falso: guarda o que se pediu para depois da troca e deixa o teste dizer quando a troca acabou. */
function fakePorts(active: number) {
    const log: string[] = [];
    let pending: (() => void) | null = null;
    const ports: ChapterPorts = {
        active,
        afterChapterChange: (then) => { log.push('after'); pending = then; },
        setActive: (c) => log.push(`set:${c}`),
    };
    return { ports, log, finishSwitch: () => pending?.() };
}

test('scrollInChapter: no capítulo aberto salta já, sem trocar', () => {
    const { ports, log } = fakePorts(3);
    scrollInChapter(ports, 3, () => log.push('scroll'));
    expect(log).toEqual(['scroll']);
});

test('scrollInChapter: com o livro todo aberto salta já, de qualquer capítulo', () => {
    const { ports, log } = fakePorts(-1);
    scrollInChapter(ports, 5, () => log.push('scroll'));
    expect(log).toEqual(['scroll']);
});

test('scrollInChapter: noutro capítulo regista o salto ANTES de trocar e só salta quando a troca acaba', () => {
    const { ports, log, finishSwitch } = fakePorts(1);
    scrollInChapter(ports, 4, () => log.push('scroll'));
    expect(log).toEqual(['after', 'set:4']);
    finishSwitch();
    expect(log).toEqual(['after', 'set:4', 'scroll']);
});
