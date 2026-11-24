import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
const { pdfStyles } = await import('./pdf-styles');
const { reviewStyles } = await import('./style-audit');
const { classEffects } = await import('../../utils/css-rule');
const { fontStyleOf } = await import('./pdf-pages');
type Page = import('./pdf-pages').PdfPageText;

// Coluna de 60 a 360 pt, corpo de 11 pt, entrelinha de 14.
interface L { text: string; x0?: number; w?: number; size?: number; bold?: boolean; italic?: boolean; extra?: number }
function page(lines: L[]): Page {
    let y = 700;
    const items = lines.map((l) => {
        y -= 14 + (l.extra ?? 0);
        const size = l.size ?? 11;
        return { str: l.text, transform: [size, 0, 0, size, l.x0 ?? 60, y], width: l.w ?? 300, font: { bold: !!l.bold, italic: !!l.italic } };
    });
    return { vpH: 800, items };
}
// Um parágrafo = linhas a x0=60 (a 1.ª com o recuo `indent`), a última curta.
const para = (words: string[], indent = 0, over: Partial<L> = {}): L[] => words.map((t, i) => ({ text: t, x0: 60 + (i === 0 ? indent : 0), w: i === words.length - 1 ? 120 : 300 - (i === 0 ? indent : 0), ...over }));
const text = (...ls: L[][]) => ls.flat();
const filler = (n: number) => para(Array.from({ length: n }, (_, i) => `linha de enchimento numero ${i} do corpo do texto`));

const A = ['Primeira linha do paragrafo alfa com texto', 'segunda linha do paragrafo alfa continua', 'fim do alfa'];
const B = ['Primeira linha do paragrafo beta encostada', 'segunda linha do paragrafo beta continua', 'fim do beta'];
const joined = (ls: string[]) => ls.join(' ');

test('fontStyleOf: negrito e itálico a partir do nome da fonte', () => {
    expect(fontStyleOf('ABCDEF+SourceSansPro-Bold')).toEqual({ bold: true, italic: false });
    expect(fontStyleOf('STIXTwoText-Italic')).toEqual({ bold: false, italic: true });
    expect(fontStyleOf('Minion-SemiboldItalic')).toEqual({ bold: true, italic: true });
    expect(fontStyleOf('Helvetica')).toEqual({ bold: false, italic: false });
});

test('indentação: o PDF recua e o livro não (e ao contrário)', () => {
    const pdf = pdfStyles([page(text(filler(10), para(A, 17), para(B)))]);
    const html = `<p>${joined(A)}</p><p class="p-indent">${joined(B)}</p>`;
    const { html: out, diffs } = reviewStyles(html, pdf, ['indent']);
    expect(diffs.map((d) => [d.kind, d.add, d.remove])).toEqual([['indent', ['p-indent'], []], ['indent', [], ['p-indent']]]);
    expect(out).toBe(`<p class="p-indent">${joined(A)}</p><p>${joined(B)}</p>`);
});

test('negrito: parágrafo todo em negrito no PDF → p-bold e tira o recuo; sem negrito no PDF → tira p-bold', () => {
    const pdf = pdfStyles([page(text(filler(10), para(A, 0, { bold: true }), para(B)))]);
    const html = `<p class="p-indent">${joined(A)}</p><p class="p-bold">${joined(B)}</p>`;
    expect(reviewStyles(html, pdf, ['emphasis']).html).toBe(`<p class="p-bold">${joined(A)}</p><p>${joined(B)}</p>`);
});

test('itálico + negrito → p-bold-italic', () => {
    const pdf = pdfStyles([page(text(filler(10), para(A, 0, { bold: true, italic: true })))]);
    expect(reviewStyles(`<p>${joined(A)}</p>`, pdf, ['emphasis']).html).toBe(`<p class="p-bold-italic">${joined(A)}</p>`);
});

test('negrito só numa parte da linha: não mexe', () => {
    const pdf = pdfStyles([page(text(filler(10), para(A)))]);
    pdf.pages[0].lines[10].bold = true; // só a 1.ª linha
    expect(reviewStyles(`<p>${joined(A)}</p>`, pdf, ['emphasis']).diffs).toEqual([]);
});

test('centrado: uma linha curta ao meio da coluna → p-center (e tira o recuo); justificada com a classe → tira-a', () => {
    const pdf = pdfStyles([page(text(filler(10), [{ text: 'Titulo centrado do bloco aqui', x0: 130, w: 160 }], para(B)))]);
    const html = `<p class="p-indent">Titulo centrado do bloco aqui</p><p class="p-center">${joined(B)}</p>`;
    expect(reviewStyles(html, pdf, ['center']).html).toBe(`<p class="p-center">Titulo centrado do bloco aqui</p><p>${joined(B)}</p>`);
});

test('uma linha curta recuada que acaba por ficar ao meio não é centrada', () => {
    const pdf = pdfStyles([page(text(filler(10), [{ text: 'Frase curta de dialogo recuada', x0: 77, w: 247 }]))]);
    expect(reviewStyles('<p>Frase curta de dialogo recuada</p>', pdf, ['center']).diffs).toEqual([]);
});

test('letra pequena: p-small quando o PDF tem corpo menor; tira-o quando é do corpo', () => {
    const pdf = pdfStyles([page(text(filler(10), para(A, 0, { size: 8 }), para(B)))]);
    const html = `<p>${joined(A)}</p><p class="p-small">${joined(B)}</p>`;
    expect(reviewStyles(html, pdf, ['small']).html).toBe(`<p class="p-small">${joined(A)}</p><p>${joined(B)}</p>`);
});

test('espaço acima: p-top quando há salto no PDF; tira-o quando não há; com título no meio não conta', () => {
    const pdf = pdfStyles([page(text(filler(10), para(A), para(B).map((l, i) => (i === 0 ? { ...l, extra: 10 } : l))))]);
    const html = `<p>${joined(A)}</p><p>${joined(B)}</p>`;
    expect(reviewStyles(html, pdf, ['spacing']).html).toBe(`<p>${joined(A)}</p><p class="p-top">${joined(B)}</p>`);
    expect(reviewStyles(`<p>antes</p><p class="p-top">${joined(A)}</p><p>${joined(B)}</p>`, pdf, ['spacing']).html).toBe(`<p>antes</p><p>${joined(A)}</p><p class="p-top">${joined(B)}</p>`);
    expect(reviewStyles(`<p>${joined(A)}</p><h2>x</h2><p>${joined(B)}</p>`, pdf, ['spacing']).diffs).toEqual([]);
});

test('espaço acima: um estilo que já dá espaço (p-bold, ou um do utilizador) evita o aviso; sem ele, avisa', () => {
    const pdf = pdfStyles([page(text(filler(10), para(A), para(B).map((l, i) => (i === 0 ? { ...l, extra: 10 } : l))))]);
    const html = (cls: string) => `<p>${joined(A)}</p><p class="${cls}">${joined(B)}</p>`;
    const fx = classEffects('.p-bold { font-weight: bold; margin-top: 1.5em; } .destaque { margin-top: 2em; }');
    expect(reviewStyles(html('p-bold'), pdf, ['spacing'], fx).diffs).toEqual([]);
    expect(reviewStyles(html('destaque x'), pdf, ['spacing'], fx).diffs).toEqual([]);
    // o p-bold NÃO dá espaço neste livro (CSS sem margin-top): avisa
    const sem = classEffects('.p-bold { font-weight: bold; }');
    expect(reviewStyles(html('p-bold'), pdf, ['spacing'], sem).diffs.map((d) => [d.add, d.text.slice(0, 10)])).toEqual([[['p-top'], B[0].slice(0, 10)]]);
    expect(reviewStyles(html('p-bold'), pdf, ['spacing']).diffs.length).toBe(1); // sem CSS conta só o p-top
});

test('estilo renomeado (p-bold → p-subtitulo): conta como o original, pelo que o CSS diz que faz', () => {
    const fx = classEffects('.p-subtitulo { font-weight: bold !important; margin-top: 1.5em; }');
    const pdf = pdfStyles([page(text(filler(10), para(A), para(B, 0, { bold: true }).map((l, i) => (i === 0 ? { ...l, extra: 10 } : l))))]);
    const html = `<p>${joined(A)}</p><p class="p-subtitulo">${joined(B)}</p>`;
    // sem o CSS: manda acrescentar p-bold (e p-top); com ele, o p-subtitulo já é negrito e já tem espaço
    expect(reviewStyles(html, pdf, ['emphasis', 'spacing']).diffs.map((d) => d.add)).toEqual([['p-bold'], ['p-top']]);
    expect(reviewStyles(html, pdf, ['emphasis', 'spacing'], fx).diffs).toEqual([]);
    // o PDF sem negrito: manda tirar o p-subtitulo (é ele que dá o negrito)
    const plain = pdfStyles([page(text(filler(10), para(A), para(B)))]);
    expect(reviewStyles(html, plain, ['emphasis'], fx).diffs.map((d) => [d.add, d.remove])).toEqual([[[], ['p-subtitulo']]]);
});

test('capitular: a 1.ª letra é uma linha à parte no PDF e o parágrafo acha-se na mesma, sem mexer na indentação', () => {
    const pdf = pdfStyles([page(text(filler(10), [{ text: 'P', x0: 60, w: 30, size: 30 }], para(['aragrafo alfa com capitular e texto', 'segunda linha do paragrafo alfa continua', 'fim']), para(B)))]);
    const { diffs } = reviewStyles(`<p class="p-indent">Paragrafo alfa com capitular e texto segunda linha do paragrafo alfa continua fim</p>`, pdf, ['indent']);
    expect(diffs).toEqual([]);
});

test('ligaturas no PDF (ﬁ) casam com o texto do livro', () => {
    const pdf = pdfStyles([page(text(filler(10), para(['Um paragrafo ﬁnal com ligatura no texto aqui', 'segunda linha do paragrafo continua', 'fim'], 17)))]);
    const { diffs, checked } = reviewStyles('<p>Um paragrafo final com ligatura no texto aqui segunda linha do paragrafo continua fim</p>', pdf, ['indent']);
    expect(checked).toBe(1);
    expect(diffs.map((d) => d.add)).toEqual([['p-indent']]);
});

test('não acha o parágrafo, ou é do Índice / classe especial: ignora (não adivinha)', () => {
    const pdf = pdfStyles([page(text(filler(10), para(A, 17)))]);
    const html = `<p>texto que nao esta no pdf de forma nenhuma</p><p class="p-quote">${joined(A)}</p><p class="chapter-break-h1" data-title="Índice"></p><p>${joined(A)}</p>`;
    const out = reviewStyles(html, pdf);
    expect(out.diffs).toEqual([]);
    expect(out.html).toBe(html); // sem diferenças devolve o HTML tal e qual
});

test('corrigir duas vezes dá o mesmo: a 2.ª passagem já não encontra nada', () => {
    const pdf = pdfStyles([page(text(filler(10), para(A, 17), para(B, 0, { bold: true }), [{ text: 'Titulo centrado do bloco aqui', x0: 130, w: 160 }]))]);
    const html = `<p>${joined(A)}</p><p class="p-indent">${joined(B)}</p><p class="p-indent">Titulo centrado do bloco aqui</p>`;
    const once = reviewStyles(html, pdf);
    expect(once.diffs.length).toBeGreaterThan(2);
    expect(reviewStyles(once.html, pdf).diffs).toEqual([]);
});
