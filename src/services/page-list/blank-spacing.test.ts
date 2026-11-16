import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

const { verifyBlankSpacing } = await import('./blank-spacing');

type Item = { str: string; transform: number[] };
const it = (str: string, y: number): Item => ({ str, transform: [1, 0, 0, 1, 50, y] });
// Linhas: cabeçalho, 3 de corpo com entrelinha 12, depois um parágrafo com 36 de espaço acima e outro colado (12).
const pages = [{ vpH: 800, items: [it('CABECALHO CORRENTE', 750), it('linha um do corpo da pagina', 700), it('linha dois do corpo da pagina', 688), it('linha tres do corpo da pagina', 676), it('Paragrafo com espaco a cima', 640), it('Paragrafo colado ao anterior', 628)] }];
const html = '<p data-blank-top="1">Paragrafo com espaco a cima</p><p data-blank-top="1">Paragrafo colado ao anterior</p><p data-blank-top="1">Sem correspondencia no PDF</p>';

test('verifyBlankSpacing: p-top só onde o PDF confirma um gap claramente maior que a entrelinha; o marcador sai sempre', () => {
    const out = verifyBlankSpacing(html, pages);
    expect(out).toBe('<p class="p-top">Paragrafo com espaco a cima</p><p>Paragrafo colado ao anterior</p><p>Sem correspondencia no PDF</p>');
});

test('verifyBlankSpacing: sem PDF não há p-top (mais seguro que assumir) e sem candidatos o html fica igual', () => {
    expect(verifyBlankSpacing(html)).toBe('<p>Paragrafo com espaco a cima</p><p>Paragrafo colado ao anterior</p><p>Sem correspondencia no PDF</p>');
    expect(verifyBlankSpacing('<p>nada</p>', pages)).toBe('<p>nada</p>');
});
