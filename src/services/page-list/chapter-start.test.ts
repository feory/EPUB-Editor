import { test, expect } from 'bun:test';
import '../indesign/happy-dom';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
Object.assign(globalThis, { NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 } }); // outros testes só definem SHOW_TEXT
const { movePageBreaksToChapterStart } = await import('./page-list');

const PB = (n: number) => `<span class="pagebreak" data-page="${n}"></span>`;
const OPENING = '<p class="chapter-break-h2" data-title="II">&nbsp;</p><div class="box b-caixa-preta"><h2 class="p-center">II</h2></div><h3 class="p-center">AGORA ANTES.</h3>';

test('página a seguir à abertura de um h2: o marcador sobe para o início do capítulo', () => {
    const html = `<p>fim do capítulo anterior, texto longo o bastante.</p>${OPENING}<p class="p-space">${PB(21)}DEZ minutos depois, a casa de banho dos homens.</p>`;
    const out = movePageBreaksToChapterStart(html);
    expect(out).toContain(`<div class="box b-caixa-preta">${PB(21)}<h2 class="p-center">II</h2></div>`);
    expect(out).toContain('<p class="p-space">DEZ minutos depois');
    expect(out.match(/pagebreak/g)).toHaveLength(1);
});

test('também no h1 (marcador no meio do título): vai para antes do 1.º texto', () => {
    const html = `<p class="chapter-break-h1" data-title="Um">&nbsp;</p><div class="box"><h1>1<br><br>${PB(13)}O DOUTOR ESTÁ AQUI</h1></div><p>texto</p>`;
    expect(movePageBreaksToChapterStart(html)).toContain(`<div class="box">${PB(13)}<h1>1<br><br>O DOUTOR ESTÁ AQUI</h1></div>`);
});

test('já no início, sem marcador, ou com muito texto antes: não mexe (mesmo html)', () => {
    const atStart = `${OPENING.replace('<h2 class="p-center">', `${PB(21)}<h2 class="p-center">`)}<p>corpo</p>`;
    expect(movePageBreaksToChapterStart(atStart)).toBe(atStart);
    const none = `${OPENING}<p>corpo sem marcador de página nenhum</p>`;
    expect(movePageBreaksToChapterStart(none)).toBe(none);
    const longBody = `${OPENING}<p>${'texto comprido '.repeat(30)}</p><p>${PB(22)}página seguinte</p>`;
    expect(movePageBreaksToChapterStart(longBody)).toBe(longBody);
});

test('não atravessa para o capítulo seguinte', () => {
    const html = `<p class="chapter-break-h2" data-title="A">&nbsp;</p><h2>A</h2><p class="chapter-break-h2" data-title="B">&nbsp;</p><h2>B</h2><p>${PB(5)}corpo de B</p>`;
    const out = movePageBreaksToChapterStart(html);
    expect(out).toContain(`<h2>${PB(5)}B</h2>`); // B abre no próprio h2 (bloco de topo); A não rouba a página
    expect(out).toContain('<h2>A</h2>');
});
