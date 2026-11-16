import { test, expect } from 'bun:test';
import '../../indesign/happy-dom';

const { insertFigures } = await import('./figures');

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
