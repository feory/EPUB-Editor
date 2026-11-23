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

const { createPrintPdfStore } = await import('./print-pdf');
const bytes = (n: number) => new Uint8Array([n]).buffer;
// Um servidor falso: `files` = o que há por livro; conta descarregamentos e leituras (open).
function fake(files: Record<string, ArrayBuffer | null>) {
    const calls = { download: 0, upload: 0, open: 0 };
    const store = createPrintPdfStore({
        download: async (isbn) => { calls.download++; return files[isbn] ?? null; },
        upload: async (isbn, data) => { calls.upload++; files[isbn] = data instanceof Blob ? await data.arrayBuffer() : data; },
        open: () => { calls.open++; return printPdfFromPages(async () => pages); },
    });
    return { store, calls, files };
}

test('store: vários pedidos do mesmo livro descarregam e abrem o PDF uma vez', async () => {
    const { store, calls } = fake({ a: bytes(1) });
    const [x, y] = await Promise.all([store.get('a'), store.get('a')]);
    await store.get('a');
    expect(x).toBe(y);
    expect(calls).toEqual({ download: 1, upload: 0, open: 1 });
});

test('store: sem PDF (null) não fica guardado, para um PDF que apareça depois se ler', async () => {
    const { store, calls, files } = fake({});
    expect(await store.get('a')).toBeNull();
    files.a = bytes(2);
    expect((await store.get('a'))?.data).toBe(files.a);
    expect(calls.download).toBe(2);
});

test('store: um descarregamento que falha não fica guardado', async () => {
    let fail = true;
    const store = createPrintPdfStore({ download: async () => { if (fail) throw new Error('rede'); return bytes(1); }, upload: async () => {}, open: () => printPdfFromPages(async () => pages) });
    await expect(store.get('a')).rejects.toThrow('rede');
    fail = false;
    expect(await store.get('a')).not.toBeNull();
});

test('store: gravar um PDF novo troca o que está em memória sem o descarregar outra vez', async () => {
    const { store, calls } = fake({ a: bytes(1) });
    const old = await store.get('a');
    const novo = bytes(9);
    await store.save('a', novo);
    const after = await store.get('a');
    expect(after?.data).toBe(novo);
    expect(after).not.toBe(old);
    expect(calls).toEqual({ download: 1, upload: 1, open: 2 });
});

test('store: gravar com um Blob também serve (importação, painel)', async () => {
    const { store } = fake({});
    await store.save('a', new Blob([new Uint8Array([7, 7])]));
    expect(new Uint8Array((await store.get('a'))!.data)).toEqual(new Uint8Array([7, 7]));
});

test('store: se a gravação falha, o PDF que estava em memória continua', async () => {
    const calls = { download: 0 };
    const store = createPrintPdfStore({ download: async () => { calls.download++; return bytes(1); }, upload: async () => { throw new Error('413'); }, open: () => printPdfFromPages(async () => pages) });
    const old = await store.get('a');
    await expect(store.save('a', bytes(2))).rejects.toThrow('413');
    expect(await store.get('a')).toBe(old);
    expect(calls.download).toBe(1);
});

test('store: só guarda o último livro (um PDF pode ter 150 MB)', async () => {
    const { store, calls } = fake({ a: bytes(1), b: bytes(2) });
    await store.get('a'); await store.get('b'); await store.get('a');
    expect(calls.download).toBe(3);
});
