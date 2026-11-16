import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
const { reviewFigures } = await import('./figure-audit');
const { imageBoxes } = await import('./pdf-pages');
type Pdf = import('./pdf-styles').PdfStyles;
type Box = import('./pdf-pages').PdfImageBox;

const line = (key: string, y: number) => ({ key, y, x0: 60, x1: 360, size: 11, bold: false, italic: false });
const pdfPage = (lines: ReturnType<typeof line>[], images?: Box[]) => ({ left: 60, right: 360, gap: 14, lines, images });

// 4 páginas, um parágrafo por página (a 1.ª linha de cada um é a chave) e a legenda da figura 1.1 na página 1, abaixo do parágrafo.
const P = ['primeiroparagrafodolivro', 'segundoparagrafodolivro', 'terceiroparagrafodolivro', 'quartoparagrafodolivro'];
const pdf = (images?: Box[]): Pdf => ({ body: 11, pages: [
    pdfPage([line(P[0], 600), line('figura11legendadaprimeirafigura', 300)], images),
    pdfPage([line(P[1], 600)]), pdfPage([line(P[2], 600)]), pdfPage([line(P[3], 600)]),
] });
const p = (i: number) => `<p>${['Primeiro paragrafo do livro', 'Segundo paragrafo do livro', 'Terceiro paragrafo do livro', 'Quarto paragrafo do livro'][i]}</p>`;
const FIG = '<img data-image-id="a" src="x" alt=""><p class="p-legendas">Figura 1.1 Legenda da primeira figura</p>';
const book = (...parts: string[]) => `<p class="chapter-break-h1" data-title="Um"></p>${parts.join('')}`;

test('figura 3 páginas depois do sítio do PDF: move imagem + legenda para depois do parágrafo que a antecede no PDF', () => {
    const r = reviewFigures(book(p(0), p(1), p(2), p(3), FIG), pdf());
    expect(r.diffs.map((d) => [d.kind, d.fixable])).toEqual([['posicao', true]]);
    expect(r.html).toBe(book(p(0), FIG, p(1), p(2), p(3)));
    expect(reviewFigures(r.html, pdf()).diffs).toEqual([]); // idempotente
});

test('figura antes do sítio (2+ páginas): move para a frente', () => {
    const noFim: Pdf = { body: 11, pages: [pdfPage([line(P[0], 600)]), pdfPage([line(P[1], 600)]), pdfPage([line(P[2], 600)]), pdfPage([line(P[3], 600), line('figura11legendadaprimeirafigura', 300)])] };
    const r = reviewFigures(book(FIG, p(0), p(1), p(2), p(3)), noFim);
    expect(r.diffs.map((d) => d.kind)).toEqual(['posicao']);
    expect(r.html).toBe(book(p(0), p(1), p(2), p(3), FIG));
});

test('o parágrafo que cita a figura ("Figura 1.1") é onde ela fica', () => {
    const citing = '<p>Segundo paragrafo do livro (Figura 1.1)</p>';
    const r = reviewFigures(book(p(0), citing, p(2), p(3), FIG), pdf());
    expect(r.html).toBe(book(p(0), citing, FIG, p(2), p(3)));
});

test('a figura flutua uma página: não é diferença (o impresso põe-nas no topo/fundo)', () => {
    expect(reviewFigures(book(p(0), p(1), FIG, p(2), p(3)), pdf()).diffs).toEqual([]);
});

test('imagem e legenda trocadas face ao PDF: troca-as; legenda antes da imagem com a imagem por baixo fica como está', () => {
    const acima = pdf([{ x0: 80, x1: 340, y0: 320, y1: 560 }]); // imagem por cima da legenda (y 300)
    const r = reviewFigures(book(p(0), '<p class="p-legendas">Figura 1.1 Legenda da primeira figura</p><img data-image-id="a" src="x" alt="">', p(1)), acima);
    expect(r.diffs.map((d) => d.kind)).toEqual(['ordem']);
    expect(r.html).toBe(book(p(0), FIG, p(1)));
    expect(reviewFigures(book(p(0), FIG, p(1)), acima).diffs).toEqual([]);
    const abaixo = pdf([{ x0: 80, x1: 340, y0: 100, y1: 280 }]); // imagem por baixo da legenda
    expect(reviewFigures(book(p(0), FIG, p(1)), abaixo).diffs.map((d) => d.kind)).toEqual(['ordem']);
});

test('legenda que não se acha no PDF, ou sem legenda: ignora; figura noutro capítulo: avisa sem mover', () => {
    const sem = '<img data-image-id="b" src="x" alt="">';
    const html = book(p(0), p(1), p(2), p(3), sem, '<p class="p-legendas">Figura 9.9 Que nao existe no pdf</p>');
    expect(reviewFigures(html, pdf())).toMatchObject({ diffs: [], checked: 0, seen: 1 });
    const outroCap = book(p(0)) + '<p class="chapter-break-h1" data-title="Dois"></p>' + p(1) + p(2) + p(3) + FIG;
    const r = reviewFigures(outroCap, pdf());
    expect(r.diffs.map((d) => d.fixable)).toEqual([false]); // o sítio do PDF (depois de p(0)) é de outro capítulo: avisa, não move
    expect(r.html).toBe(outroCap);
});

test('imageBoxes: segue save/restore/transform e ignora o pequeno e o fundo da página', () => {
    const OPS = { save: 1, restore: 2, transform: 3, paintImageXObject: 4, paintInlineImageXObject: 5, paintImageMaskXObject: 6, paintImageXObjectRepeat: 7 };
    const fn = [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore, OPS.paintImageXObject, OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore, OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore];
    const args = [null, [200, 0, 0, 100, 50, 400], null, null, null, null, [10, 0, 0, 10, 0, 0], null, null, null, [600, 0, 0, 800, 0, 0], null, null];
    expect(imageBoxes(fn, args, OPS, 612, 792)).toEqual([{ x0: 50, x1: 250, y0: 400, y1: 500 }]); // a unidade fora do transform (1×1), o ícone (10×10) e a página inteira ficam de fora
});
