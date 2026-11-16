import { test, expect } from 'bun:test';
import '../services/indesign/happy-dom';
import { isFillerBlock, isStructureBlock, isBreakClass, markerBefore, createPageHolder, LEADING_FILLER_RE } from './chapter-filler';

const PB = '<span class="pagebreak" data-page="9"></span>';
// Blocos que podem ficar entre o marcador e o heading, e o que NÃO é enchimento.
const FILLERS: Record<string, string> = {
    'div do marcador de página': `<div>${PB}&nbsp;</div>`,
    'p só com o marcador de página': `<p>${PB}</p>`,
    'âncora de capítulo': '<p class="chapter-anchor" id="idx-anchor-1"></p>',
    'hr': '<hr>',
    'p vazio': '<p></p>',
    'p só com br': '<p><br></p>',
};
const CONTENT: Record<string, string> = {
    'heading': '<h1>Cap</h1>',
    'parágrafo': '<p>texto</p>',
    'imagem': '<p><img src="x"></p>',
    'div com texto': `<div>${PB}texto</div>`,
};
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const el = (html: string): Element => parse(html).body.firstElementChild!;
const lead = (html: string) => (html.match(LEADING_FILLER_RE) ?? [''])[0];

test('as duas formas da definição (DOM e texto) concordam em cada caso', () => {
    for (const [name, html] of Object.entries(FILLERS)) {
        expect([name, isFillerBlock(el(html))]).toEqual([name, true]);
        expect([name, lead(html)]).toEqual([name, html]);
    }
    for (const [name, html] of Object.entries(CONTENT)) {
        expect([name, isFillerBlock(el(html))]).toEqual([name, false]);
        expect([name, lead(html)]).toEqual([name, '']);
    }
});

test('markerBefore: salta o enchimento até ao marcador; conteúdo pelo meio → null', () => {
    const body = (inner: string) => parse(inner).body;
    for (const filler of Object.values(FILLERS)) {
        const d = body(`<p class="chapter-break-h1" data-title="C"></p>${filler}<h1>C</h1>`);
        expect(markerBefore(d.querySelector('h1')!)).toBe(d.firstElementChild);
    }
    const d = body('<p class="chapter-break-h1" data-title="C"></p><p>texto</p><h1>C</h1>');
    expect(markerBefore(d.querySelector('h1')!)).toBeNull();
    expect(markerBefore(body('<h1>C</h1>').firstElementChild!)).toBeNull();
});

test('createPageHolder produz exatamente o que as duas formas aceitam como enchimento', () => {
    const holder = createPageHolder(parse(''), el(PB));
    expect(isFillerBlock(holder)).toBe(true);
    expect(lead(holder.outerHTML)).toBe(holder.outerHTML);
});

test('classes: marcador plano e de nível; âncora é estrutura mas não é marcador', () => {
    expect(['chapter-break', 'chapter-break-h2', 'p-top chapter-break-h1'].every(isBreakClass)).toBe(true);
    expect(isBreakClass('chapter-anchor')).toBe(false);
    expect(isStructureBlock(el('<p class="chapter-anchor"></p>'))).toBe(true);
});
