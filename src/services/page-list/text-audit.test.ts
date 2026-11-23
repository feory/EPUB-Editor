import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
Object.assign(globalThis, { NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 } }); // o walker de textIndex também lê elementos
const { auditText } = await import('./text-audit');
type Page = import('./pdf-pages').PdfPageText;

// `folio` = nº impresso no rodapé (com ele a 1.ª linha conta como cabeçalho corrente)
const page = (lines: string[], folio?: number): Page => ({ vpH: 800, items: [...lines.map((str, i) => ({ str, transform: [11, 0, 0, 11, 60, 700 - i * 14] })), ...(folio ? [{ str: String(folio), transform: [11, 0, 0, 11, 60, 50] }] : [])] });
const L = (n: number) => `linha numero ${n} do texto corrido do livro`;
const book = (...ps: string[]) => ps.map((p) => `<p>${p}</p>`).join('');

test('texto igual (com hifenização e quebras de linha do PDF): sem diferenças', () => {
    const pdf = [page(['cabecalho corrente do livro', 'O parágrafo começa aqui e a pala-', 'vra partida continua na linha seguinte', L(1)], 7)];
    const html = book('O parágrafo começa aqui e a palavra partida continua na linha seguinte', L(1));
    const a = auditText(pdf, html);
    expect(a.missing).toEqual([]);
    expect(a.extra).toEqual([]);
    expect(a.pdfLines).toBeGreaterThan(0);
});

test('linha do PDF que falta no livro e bloco do livro que o PDF não tem', () => {
    const pdf = [page(['x', L(1), 'esta linha foi perdida na importacao do livro', L(2), L(3)])];
    const html = book(L(1), L(2), L(3), 'este paragrafo so existe no livro e nao no impresso');
    const a = auditText(pdf, html);
    expect(a.missing.map((m) => m.text)).toEqual(['esta linha foi perdida na importacao do livro']);
    expect(a.missing[0].page).toBe(1);
    expect(a.extra.map((e) => e.text)).toEqual(['este paragrafo so existe no livro e nao no impresso']);
});

test('cabeçalho repetido, Índice e ficha técnica não contam', () => {
    const head = 'cabecalho que se repete em todas as paginas';
    const pdf = [1, 2, 3, 4].map((n) => page([head, L(n)]));
    const html = `<p class="chapter-break" data-title="Ficha Técnica"></p>${book('texto so da ficha tecnica do livro inteiro')}<p class="chapter-break" data-title="Capítulo 1"></p>${book(L(1), L(2), L(3), L(4))}`;
    const a = auditText(pdf, html);
    expect(a.missing).toEqual([]);
    expect(a.extra).toEqual([]);
});

test('página em colunas/tabela não se compara; o texto do livro nela não conta como a mais', () => {
    // 5 linhas com duas colunas separadas por um espaço largo (itens com largura)
    const cols = (n: number) => ({ vpH: 800, items: Array.from({ length: 5 }, (_, r) => [
        { str: `coluna esquerda linha ${r} da pagina ${n}`, transform: [11, 0, 0, 11, 60, 700 - r * 14], width: 200 },
        { str: `zzzdireita ${r} ${n}`, transform: [11, 0, 0, 11, 330, 700 - r * 14], width: 200 },
    ]).flat() });
    const pdf = [page([L(1), L(2), L(3)]), cols(2)];
    const html = book(L(1), L(2), L(3), 'coluna esquerda linha 0 da pagina 2 coluna esquerda linha 1 da pagina 2 coluna esquerda linha 2 da pagina 2');  // a célula da esquerda, que o PDF intercala com a da direita
    const a = auditText(pdf, html);
    expect(a.columnPages).toEqual([2]);
    expect(a.missing).toEqual([]);
    expect(a.extra).toEqual([]);
    expect(a.columnBlocks).toBe(1);
});

test('linhas que faltam numa página onde o livro tem uma imagem são texto de figura provável; legendas não', () => {
    const pdf = [page([L(1), 'texto interno do diagrama da pagina', L(2), 'Figura 3.1 Uma legenda de verdade aqui', L(3)])];
    const html = `${book(L(1))}<img src="x.png">${book(L(2), L(3))}`;
    const a = auditText(pdf, html);
    expect(a.figureText.map((f) => f.text)).toEqual(['texto interno do diagrama da pagina']);
    expect(a.missing.map((m) => m.text)).toEqual(['Figura 3.1 Uma legenda de verdade aqui']);
});
