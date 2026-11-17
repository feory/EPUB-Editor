import { test, expect } from 'bun:test';
import '../../indesign/happy-dom';

const { insertFigures, placeFigures, placeNumberedFigures } = await import('./figures');

const fig = (imageId: string) => ({ imageId, label: { kind: 'fig' as const, num: '1.1' }, captionLines: ['figura 1.1 Alicerces do marketing 7.0.'] });

test('"Figura 1.1" no corpo: imagem a seguir à referência, legenda por baixo', () => {
    const { html, placed } = insertFigures('<p>Ver (Figura 1.1) abaixo.</p><p>Seguinte.</p>', [fig('c01f001')]);
    expect(placed).toBe(1);
    expect(html).toMatch(/Ver \(Figura 1\.1\) abaixo\.<\/p><img data-image-id="c01f001"[^>]*><p class="p-legendas">figura 1\.1 Alicerces/);
});

test('2 imagens com a mesma legenda: juntas, sob uma só legenda', () => {
    const { html, placed } = insertFigures('<p>Ver (Figura 1.1).</p>', [fig('a'), fig('b')]);
    expect(placed).toBe(2);
    expect(html).toMatch(/<img data-image-id="a"[^>]*><img data-image-id="b"[^>]*><p class="p-legendas">/);
    expect(html.match(/p-legendas/g)).toHaveLength(1);
});

test('legenda com formatação do InDesign: rótulo em negrito e maiúsculas, centrada', () => {
    const f = { ...fig('c01f001'), captionFmt: { labelLen: 10, bold: true, upper: true, cls: 'p-center' } };
    const { html } = insertFigures('<p>Ver (Figura 1.1).</p>', [f]);
    expect(html).toContain('<p class="p-legendas p-center"><strong>FIGURA 1.1</strong> Alicerces do marketing 7.0.</p>');
});

const ids = (html: string) => [...html.matchAll(/data-image-id="([^"]+)"/g)].map(m => m[1]);

test('placeFigures: livro com legendas em texto — as imagens sem legenda (nome com nº) NÃO colam a "Figura N" do corpo', async () => {
    const html = '<p>Ver (Figura 1.1).</p><p>Como mostra a Figura 1, o resto.</p>';
    const figs = [fig('c01f001'), { imageId: 'flast01uf001', captionLines: [] }];
    const { html: out, placed } = await placeFigures(html, figs, ['c01f001', 'flast01uf001']);
    expect(ids(out)).toEqual(['c01f001']);
    expect(placed).toBe(1);
});

test('placeFigures: livro sem legendas em texto — a imagem vai à referência "Figura N" pelo nº do nome do ficheiro', async () => {
    const { html: out, placed } = await placeFigures('<p>Como mostra a Figura 2, o resto.</p>', [{ imageId: 'fig002', captionLines: [] }], ['fig002']);
    expect(ids(out)).toEqual(['fig002']);
    expect(placed).toBe(1);
});

test('placeFigures: cada passo só vê o que os anteriores não colocaram (nada fica duas vezes) e o total soma tudo', async () => {
    const html = '<p>Ver (Figura 1.1).</p><p>Figura 7: Legenda inline</p><p>fim</p>';
    const figs = [fig('c01f001'), { imageId: 'img007', captionLines: [] }];
    const { html: out, placed } = await placeFigures(html, figs, ['c01f001', 'img007']);
    expect(ids(out).sort()).toEqual(['c01f001', 'img007']);
    expect(new Set(ids(out)).size).toBe(ids(out).length);
    expect(placed).toBe(2);
});

test('placeFigures: sem PDF não há colocação por posição (vinheta sem legenda fica na galeria)', async () => {
    const { html: out, placed } = await placeFigures('<p>texto</p>', [{ imageId: 'deco', captionLines: [], pageHint: [3] }], ['deco']);
    expect(ids(out)).toEqual([]);
    expect(placed).toBe(0);
});

test('"Figura A.3" (anexo): a referência com letra casa e a imagem entra', () => {
    const f = { imageId: 'anexoA3', label: { kind: 'fig' as const, num: 'A.3' }, captionLines: ['FIGURA A.3 Esquema do anexo.'] };
    const { html, placed } = insertFigures('<p>Ver (Figura A.3) abaixo.</p><p>Seguinte.</p>', [f]);
    expect(placed).toBe(1);
    expect(html).toContain('data-image-id="anexoA3"');
    expect(placeNumberedFigures('<p>FIGURA A.3 Esquema.</p>', ['Figura A.3']).placed).toBe(1);
});
