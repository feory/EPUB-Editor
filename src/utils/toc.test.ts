import { test, expect } from 'bun:test';
import { subtreeRange, moveChapters, renameChapterPart, changeChapterLevel, insertChapterPart, deleteChapterPart } from './toc';
import { matchChapterBoundary } from './chapters';

type Level = 'h1' | 'h2' | 'h3' | 'break';
const P = ['A', 'B', 'b1', 'b2', 'C']; // A(h1) B(h1) b1(h2) b2(break) C(h1)
const L: Level[] = ['h1', 'h1', 'h2', 'break', 'h1'];

test('subtreeRange: h1 dono dos filhos, folhas isoladas', () => {
    expect(subtreeRange(L, 1)).toEqual([1, 4]); // B + b1 + b2
    expect(subtreeRange(L, 2)).toEqual([2, 3]); // h2 folha
    expect(subtreeRange(L, 4)).toEqual([4, 5]); // C até ao fim
});

test('moveChapters: subárvore h1 arrasta os filhos', () => {
    expect(moveChapters(P, L, 1, 5)).toBe('ACBb1b2'); // B(+filhos) p/ fim
    expect(moveChapters(P, L, 4, 0)).toBe('CABb1b2'); // C p/ início
});

test('moveChapters: soltar dentro da própria subárvore = no-op', () => {
    expect(moveChapters(P, L, 1, 3)).toBe('ABb1b2C');
});

test('moveChapters: mover folha (h2) sozinha', () => {
    expect(moveChapters(P, L, 2, 0)).toBe('b1ABb2C');
});

test('renameChapterPart: h1 só atualiza o marcador, nunca o heading do editor', () => {
    expect(renameChapterPart('<p class="chapter-break-h1" data-title="Old"></p><h1>Old <em>x</em></h1>', 'Novo'))
        .toBe('<p class="chapter-break-h1" data-title="Novo"></p><h1>Old <em>x</em></h1>');
});

test('renameChapterPart: break sem heading só mexe no data-title', () => {
    expect(renameChapterPart('<p class="chapter-break" data-title="X"></p><p>corpo</p>', 'Y'))
        .toBe('<p class="chapter-break" data-title="Y"></p><p>corpo</p>');
});

test('renameChapterPart: escapa HTML', () => {
    expect(renameChapterPart('<p class="chapter-break" data-title=""></p>', 'a<b>&"'))
        .toBe('<p class="chapter-break" data-title="a&lt;b&gt;&amp;&quot;"></p>');
});

test('changeChapterLevel: h1 → h3 troca marcador + tag do heading', () => {
    expect(changeChapterLevel('<p class="chapter-break-h1" data-title="Cap"></p><h1>Cap <em>x</em></h1>', 'h3'))
        .toBe('<p class="chapter-break-h3" data-title="Cap"></p><h3>Cap <em>x</em></h3>');
});

test('changeChapterLevel: h2 → break converte heading em <p> comum', () => {
    expect(changeChapterLevel('<p class="chapter-break-h2" data-title="Sub"></p><h2>Sub</h2><p>corpo</p>', 'break'))
        .toBe('<p class="chapter-break" data-title="Sub"></p><p>Sub</p><p>corpo</p>');
});

test('changeChapterLevel: break → h1 promove o data-title a heading novo', () => {
    expect(changeChapterLevel('<p class="chapter-break" data-title="Ficha"></p><p>corpo</p>', 'h1'))
        .toBe('<p class="chapter-break-h1" data-title="Ficha"></p><h1>Ficha</h1><p>corpo</p>');
});

test('changeChapterLevel: marcador não-vazio (&nbsp;/<br> do TinyMCE) também converte', () => {
    expect(changeChapterLevel('<p class="chapter-break-h1" data-title="Cap">&nbsp;</p><h1>Cap</h1>', 'h2'))
        .toBe('<p class="chapter-break-h2" data-title="Cap"></p><h2>Cap</h2>');
});

test('changeChapterLevel: hr legacy → h2 normaliza para marcador <p>', () => {
    expect(changeChapterLevel('<hr class="chapter-break" data-title="Velho"/><p>corpo</p>', 'h2'))
        .toBe('<p class="chapter-break-h2" data-title="Velho"></p><h2>Velho</h2><p>corpo</p>');
});

const front = '<p class="chapter-break" data-title="Ficha Técnica"></p><p>ft</p>';
const cap = (t: string) => `<p class="chapter-break-h1" data-title="${t}"></p><h1>${t}</h1>`;

test('insertChapterPart: entra antes do 1.º h1 explícito, nunca à frente das quebras planas do início', () => {
    const html = insertChapterPart([front, cap('A'), cap('B')], 'Novo');
    expect(html).toBe(front + '<p class="chapter-break-h1" data-title="Novo"></p><h1>Novo</h1><p></p>' + cap('A') + cap('B'));
});

test('insertChapterPart: sem h1 explícito vai para o topo; título é escapado', () => {
    expect(insertChapterPart([front], 'A&B')).toStartWith('<p class="chapter-break-h1" data-title="A&amp;B"');
});

test('insertChapterPart + deleteChapterPart: eliminar o novo devolve o livro', () => {
    const parts = [front, cap('A'), cap('B')];
    const added = insertChapterPart(parts, 'Novo');
    const novo = '<p class="chapter-break-h1" data-title="Novo"></p><h1>Novo</h1><p></p>';
    expect(added).toBe(front + novo + cap('A') + cap('B'));
    expect(deleteChapterPart([front, novo, cap('A'), cap('B')], ['h1', 'h1', 'h1', 'h1'], 1)).toBe(front + cap('A') + cap('B'));
});

test('apóstrofo no data-title: renomear substitui o valor todo e mudar de nível preserva o título', () => {
    expect(renameChapterPart(`<p class="chapter-break-h1" data-title="D'Artagnan"></p><h1>x</h1>`, "O'Neil"))
        .toBe(`<p class="chapter-break-h1" data-title="O'Neil"></p><h1>x</h1>`);
    expect(changeChapterLevel(`<p class="chapter-break-h1" data-title="D'Artagnan"></p><h1>D'Artagnan</h1><p>t</p>`, 'h2'))
        .toContain(`data-title="D'Artagnan"`);
});

test('renameChapterPart: parte sem marcador ganha marcador plano (permite [hidden])', () => {
    const out = renameChapterPart('<p>corpo</p>', 'Nota [hidden]');
    expect(out).toBe('<p class="chapter-break" data-title="Nota [hidden]"></p><p>corpo</p>');
    expect(matchChapterBoundary(out)?.title).toBe('Nota [hidden]');
});
