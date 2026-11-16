import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
Object.assign(globalThis, { NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 } });
const { insertPageBreaks } = await import('./page-list');

test('texto do capítulo Índice não recebe marcadores; a página vai para o corpo', () => {
    const html = '<p class="chapter-break-h1" data-title="Índice">&nbsp;</p><h1>Índice</h1><p>Como as redes sociais abrem a mente</p>'
        + '<p class="chapter-break-h1" data-title="Um">&nbsp;</p><h1>Um</h1><p>Como as redes sociais abrem a mente humana.</p>';
    const out = insertPageBreaks(html, [{ page: 13, pdfPageIndex: 13, anchor: 'comoasredessociais' }]).html;
    const [indice, corpo] = out.split('data-title="Um"');
    expect(indice).not.toContain('pagebreak');
    expect(corpo).toContain('pagebreak');
});

test('Índice sem marcador de capítulo a seguir: o corpo longo logo após as entradas volta a ser alinhado', () => {
    const corpo = 'Como as redes sociais abrem a mente humana. ' + 'Texto do corpo. '.repeat(15);
    const html = `<p class="chapter-break-h1" data-title="Índice">&nbsp;</p><h1>Índice</h1><p>Como as redes sociais abrem a mente</p>${'<p>Entrada curta do índice, com 13</p>'.repeat(6)}<p>${corpo}</p>`;
    const out = insertPageBreaks(html, [{ page: 13, pdfPageIndex: 13, anchor: 'comoasredessociais' }]).html;
    const i = out.indexOf('Entrada curta');
    expect(out.slice(0, i)).not.toContain('pagebreak');
    expect(out.slice(i)).toContain('pagebreak');
});

test('importação (sem marcadores de capítulo): bloco "Índice" simples também é ignorado', () => {
    const corpo = 'Como as redes sociais abrem a mente humana. ' + 'Texto do corpo. '.repeat(15);
    const html = `<p>Índice</p><p>Como as redes sociais abrem a mente <strong>13</strong></p>${'<p>Entrada curta do índice, com 13</p>'.repeat(6)}<p>${corpo}</p>`;
    const out = insertPageBreaks(html, [{ page: 13, pdfPageIndex: 13, anchor: 'comoasredessociais' }]).html;
    const i = out.indexOf('Entrada curta');
    expect(out.slice(0, i)).not.toContain('pagebreak');
    expect(out.slice(i)).toContain('pagebreak');
});
