import { test, expect } from 'bun:test';
import '../../services/indesign/happy-dom'; // DOMParser no bun
// o shim não traz NodeFilter (link-validator usa-o)
Object.assign(globalThis, { NodeFilter: { SHOW_TEXT: 4 } });
import { splitChapters, classifyChapterPart } from '../../utils/chapters';
import * as be from './bookEdit';
import type { Book } from './bookEdit';

const ch = (t: string, body = '<p>texto</p>') => `<p class="chapter-break-h1" data-title="${t}"></p><h1>${t}</h1>${body}`;

function book(html: string): Book {
    const parts = splitChapters(html);
    return { html, parts, chapters: parts.map((p, i) => classifyChapterPart(p, i)) };
}

const HTML = ch('A') + ch('B') + ch('C');

test('renomear: keep + aviso; índice inexistente ou título igual = nada', () => {
    const e = be.renameChapter(book(HTML), 1, 'Novo');
    expect(e?.commit).toBe('keep');
    expect(e?.html).toContain('data-title="Novo"');
    expect(e?.html).toContain('data-title="A"');
    expect(be.renameChapter(book(HTML), 9, 'x')).toBeNull();
});

test('mover/eliminar/criar usam commit reset (o índice ativo deixa de valer)', () => {
    const b = book(HTML);
    const moved = be.moveChapter(b, 0, 2);
    expect(moved?.commit).toBe('reset');
    expect(moved?.html).not.toBe(HTML);
    expect(be.moveChapter(b, 1, 1)).toBeNull();

    const del = be.deleteChapter(b, 1);
    expect(del?.commit).toBe('reset');
    expect(del?.html).not.toContain('data-title="B"');
    expect(del?.notice?.text).toContain('B');

    const added = be.addChapter(b);
    expect(added.commit).toBe('reset');
    expect(added.html?.startsWith('<p class="chapter-break-h1" data-title="Novo Capítulo"')).toBe(true);
});

test('mudar nível: mesmo nível = nada; senão keep', () => {
    const b = book(HTML);
    expect(be.changeLevel(b, 0, 'h1')).toBeNull();
    const e = be.changeLevel(b, 0, 'h2');
    expect(e?.commit).toBe('keep');
    expect(e?.html).toContain('chapter-break-h2');
});

test('sem efeito = aviso info e nenhum html (capitulares, Índice, links, page-list)', () => {
    const b = book('<p class="chapter-break" data-title="x"></p>');
    for (const e of [be.applyDropCaps(b), be.linkIndice(b), be.fixBookLinks(b).edit, be.generatePageList(b, [])]) {
        expect(e.html).toBeUndefined();
        expect(e.notice?.type).toBe('info');
    }
    expect(be.fixBookLinks(b).report).toBeNull();
});

test('ligar entrada num parágrafo inexistente falha com aviso de erro; remover ligação inexistente também', () => {
    const b = book(HTML);
    const e = be.linkIndiceEntry(b, 99, 0, 1); // parágrafo 99 não existe
    expect(e.html).toBeUndefined();
    expect(e.notice?.type).toBe('error');
    expect(be.linkIndiceEntry(b, 99, 0, null).notice?.type).toBe('error');
});

test('substituir no livro: conta, keep e sem aviso; 0 ocorrências = nada', () => {
    const b = book(HTML);
    expect(be.replaceInBook(b, 'zzz', 'y')).toEqual({ edit: null, count: 0 });
    const { edit, count } = be.replaceInBook(b, 'texto', 'outro');
    expect(count).toBe(3);
    expect(edit?.commit).toBe('keep');
    expect(edit?.html).not.toContain('texto');
    expect(edit?.notice).toBeUndefined();
    expect(be.countInBook(b, 'texto')).toBe(3);
});
