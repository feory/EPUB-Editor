import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
const { reviewIndex } = await import('./index-levels');
type Page = import('./pdf-pages').PdfPageText;

const it = (str: string, x: number, y: number, size = 9.5) => ({ str, transform: [size, 0, 0, size, x, y], width: str.length * 4.5, font: { bold: false, italic: false } });
// Duas colunas de uma página: margens 57 e 227; subentradas a +8, linhas de continuação a +17.
const page: Page = { vpH: 800, items: [
    it('ÍNDICE REMISSIVO', 57, 700, 14),
    it('Abbott, Derek, 277', 57, 680), it('África, 23, 72, 127', 57, 668),
    it('colonialismo europeu em, 23,', 65, 656), it('204, 210;', 74, 644),
    it('enquanto berço da humanidade, 49', 65, 632),
    it('Agrícola (general romano), 93', 57, 620),
    it('alimentar, 316;', 235, 680), it('Alarico (rei visigodo), 95', 227, 668),           // 2.ª coluna: começa por uma subentrada
    it('Holocausto, 227;', 235, 656),
    it('426 PROGRESSO — UMA HISTÓRIA', 57, 40),                                              // cabeçalho/folio: não é entrada
] };
const indexHtml = (...ps: string[]) => `<p class="chapter-break-h1" data-title="Índice">&nbsp;</p><h1>Índice</h1><p>Índice remissivo 425</p><p class="chapter-break-h1" data-title="ÍNDICE REMISSIVO">&nbsp;</p><h1>ÍNDICE REMISSIVO</h1>${ps.map((p) => `<p>${p}</p>`).join('')}`;
const toc: Page = { vpH: 800, items: [it('Índice remissivo', 57, 700), it('425', 368, 700)] }; // o Índice geral também diz "Índice remissivo"

test('reviewIndex: principal à margem da coluna, subentrada recuada, com as duas colunas lado a lado', () => {
    const html = indexHtml('Abbott, Derek, 277', 'África, 23, 72, 127', 'colonialismo europeu em, 23, 204, 210;', 'enquanto berço da humanidade, 49', 'Agrícola (general romano), 93', 'alimentar, 316;', 'Alarico (rei visigodo), 95', 'Holocausto, 227;');
    const r = reviewIndex(html, [toc, page]);
    expect([r.found, r.main, r.sub, r.unmatched]).toEqual([true, 4, 4, 0]);
    const cls = [...r.html.matchAll(/<p class="(p-indice(?:-sub)?)">(.*?)<\/p>/g)].map((m) => `${m[1] === 'p-indice' ? 'M' : 'S'} ${m[2].replace(/<[^>]+>/g, '')}`);
    expect(cls).toEqual([
        'M Abbott, Derek, 277', 'M África, 23, 72, 127', 'S colonialismo europeu em, 23, 204, 210;', 'S enquanto berço da humanidade, 49',
        'M Agrícola (general romano), 93', 'S alimentar, 316;', 'M Alarico (rei visigodo), 95', 'S Holocausto, 227;',
    ]);
});

test('reviewIndex: não mexe fora do capítulo, é idempotente e deixa de fora o que o PDF não confirma', () => {
    const html = indexHtml('Abbott, Derek, 277', 'entrada que não está no PDF, 999');
    const r = reviewIndex(html, [toc, page]);
    expect([r.main, r.sub, r.unmatched]).toEqual([1, 0, 1]);
    expect(r.html).toContain('<p>Índice remissivo 425</p>');                    // o Índice geral não é do capítulo
    expect(r.html).toContain('<p>entrada que não está no PDF, <span class="idx-link" data-target="page-999">999</span></p>'); // sem nível, mas com a página ligada
    expect(reviewIndex(r.html, [toc, page]).html).toBe(r.html);
});

test('reviewIndex: sem capítulo Índice Remissivo não há nada; sem o título no PDF liga as páginas mas não marca níveis', () => {
    expect(reviewIndex('<p class="chapter-break-h1" data-title="Capítulo 1">&nbsp;</p><p>texto</p>', [page]).found).toBe(false);
    const r = reviewIndex(indexHtml('Abbott, Derek, 277'), [{ vpH: 800, items: [it('Outra coisa', 57, 700)] }]);
    expect([r.found, r.levels, r.linked, r.main + r.sub]).toEqual([true, false, 1, 0]);
});

const link = (n: number) => `<span class="idx-link" data-target="page-${n}">${n}</span>`;
const pageLinked = (html: string) => reviewIndex(html, null);

test('reviewIndex: liga cada nº da lista de páginas (também intervalos), sem PDF', () => {
    const r = pageLinked(indexHtml('Abbott, Derek, 277', 'animismo, 54–58, 63'));
    expect(r.html).toContain(`<p>Abbott, Derek, ${link(277)}</p>`);
    expect(r.html).toContain(`<p>animismo, ${link(54)}–${link(58)}, ${link(63)}</p>`);
    expect([r.linked, r.levels, r.unmatched]).toEqual([2, false, 2]);
});

test('reviewIndex: mantém a formatação, um dígito do próprio termo não vira ligação e o HTML do termo é escapado', () => {
    const r = pageLinked(indexHtml('<em>abenaki</em>, 54, 190', 'Web 2.0 e R&amp;D, 12', 'a &lt; b, 7'));
    expect(r.html).toContain(`<p><em>abenaki</em>, ${link(54)}, ${link(190)}</p>`);
    expect(r.html).toContain(`<p>Web 2.0 e R&amp;D, ${link(12)}</p>`);
    expect(r.html).toContain(`<p>a &lt; b, ${link(7)}</p>`);
});

test('reviewIndex: ligar outra vez não muda nada, e as páginas ligam-se mesmo com o PDF que dá os níveis', () => {
    const once = reviewIndex(indexHtml('Abbott, Derek, 277', 'África, 23, 72, 127'), [toc, page]);
    expect(once.html).toContain(`<p class="p-indice">Abbott, Derek, ${link(277)}</p>`);
    expect(once.levels).toBe(true);
    expect(reviewIndex(once.html, [toc, page]).html).toBe(once.html);
});

test('reviewIndex: o recuo inline (padding-left:40px) do antigo "Recuar Subentradas" sai quando o nível vem do PDF', () => {
    const html = indexHtml('Abbott, Derek, 277').replace('<p>Abbott', '<p style="color:red; padding-left:40px;">Abbott');
    const r = reviewIndex(html, [toc, page]);
    expect(r.html).toContain('<p style="color:red" class="p-indice">Abbott');
});

test('reviewIndex: "– –" (intervalo partido pelo PDF) fica com um só travessão e o intervalo liga-se inteiro', () => {
    const r = pageLinked(indexHtml('nativos americanos, 29, 44– –49, 116', 'gado, 168— —170'));
    expect(r.html).toContain(`<p>nativos americanos, ${link(29)}, ${link(44)}–${link(49)}, ${link(116)}</p>`);
    expect(r.html).toContain(`<p>gado, ${link(168)}—${link(170)}</p>`);
    expect(r.dashes).toBe(2);
    expect(pageLinked(r.html).dashes).toBe(0); // idempotente
});

test('reviewIndex: reporta (sem corrigir) hífen partido e palavras coladas do PDF', () => {
    const html = indexHtml('vulnerabilidade devido à instabili- dade ecológica, 20', 'e eadensidadeenergética, 169', 'sustentabilidade, 5', 'Al- Biruni, 104');
    const r = pageLinked(html);
    expect(r.suspects.map((x) => [x.kind, x.text])).toEqual([['hifen-partido', 'instabili- dade'], ['palavras-coladas', 'eadensidadeenergética']]);
    expect(r.suspects[0].context).toBe('vulnerabilidade devido à instabili- dade ecológica, 20');   // 17 letras ou menos e "Al- Biruni" (maiúscula) não contam
    expect(r.html).toContain('instabili- dade ecológica');                      // fica como está
});
