import { test, expect } from 'bun:test';

(globalThis as { DOMMatrix?: unknown }).DOMMatrix ??= class {};
const { printPdfFromPages } = await import('./print-pdf');

const pages = [{ vpH: 800, items: [] }];

test('o PDF lê-se uma vez, peça as páginas ou os estilos quantas vezes quiser', async () => {
    let reads = 0;
    const pdf = printPdfFromPages(async () => { reads++; return pages; });
    await Promise.all([pdf.pages(), pdf.styles(), pdf.styles()]);
    await pdf.pages();
    expect(reads).toBe(1);
});

test('os estilos vêm das mesmas páginas', async () => {
    const pdf = printPdfFromPages(async () => pages);
    expect(await pdf.pages()).toBe(pages);
    expect((await pdf.styles()).pages.length).toBe(1);
});
