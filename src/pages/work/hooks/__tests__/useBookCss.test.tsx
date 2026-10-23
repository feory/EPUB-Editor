/**
 * Editar o CSS do livro pelo editor: aplica já e grava UMA vez (debounce), com o último texto.
 */
import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const win = new Window();
Object.assign(globalThis, { window: win, document: win.document, IS_REACT_ACT_ENVIRONMENT: true });
const { StyleProvider, useStyles } = await import('../../../../context/StyleContext');
const { ebooksApi } = await import('../../../../api/ebooks-api');
const { useBookCss } = await import('../useBookCss');
const { EMPTY_TEXT } = await import('../../editor/textProps');

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mount(isbn: string | undefined) {
    const saved: Array<[string, string]> = [];
    (ebooksApi as unknown as { saveStyle: unknown }).saveStyle = (i: string, css: string) => { saved.push([i, css]); return Promise.resolve(); };
    let book!: ReturnType<typeof useBookCss>;
    let css = () => '';
    function Harness() {
        const styles = useStyles();
        css = styles.getCurrentCss;
        book = useBookCss(isbn, 20);
        return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => { root.render(<StyleProvider><Harness /></StyleProvider>); });
    return { book: () => book, css: () => css(), saved };
}

test('várias alterações seguidas: aplica cada uma já e grava só a última, uma vez', async () => {
    const { book, css, saved } = mount('978');
    act(() => { book().editRule('p', { ...EMPTY_TEXT, align: 'center' }); });
    expect(css()).toContain('text-align: center');
    act(() => { book().editRule('p', { ...EMPTY_TEXT, align: 'right' }); });
    expect(saved).toEqual([]); // ainda dentro do debounce
    await act(async () => { await wait(60); });
    expect(saved.length).toBe(1);
    expect(saved[0][0]).toBe('978');
    expect(saved[0][1]).toContain('text-align: right');
});

test('createStyle: cria e grava; repetir a mesma classe devolve o erro e não grava', async () => {
    const { book, css, saved } = mount('978');
    let first = 'x' as string | null, second = null as string | null; // o TS não vê as atribuições dentro de act()
    act(() => { first = book().createStyle('p-nota', 'color: red;'); });
    await act(async () => { await wait(60); });
    act(() => { second = book().createStyle('p-nota', 'color: blue;'); });
    await act(async () => { await wait(60); });
    expect(first).toBeNull();
    expect(second).toBe('Já existe um estilo ".p-nota".');
    expect(css()).toContain('.p-nota { color: red; }');
    expect(saved.length).toBe(1);
});

test('sem isbn aplica mas não grava', async () => {
    const { book, css, saved } = mount(undefined);
    act(() => { book().createStyle('p-nota', 'color: red;'); });
    await act(async () => { await wait(60); });
    expect(css()).toContain('.p-nota');
    expect(saved).toEqual([]);
});
