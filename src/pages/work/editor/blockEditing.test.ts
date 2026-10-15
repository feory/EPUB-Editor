import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { EMPTY_GRID } from './gridProps';
import { inspectBlock, applyBlockEdit, createBlockWatcher, type EditorLike } from './blockEditing';

// Adapter em memória do seam EditorLike (o de produção é o TinyMCE).
function fakeEditor(html: string, select: (root: HTMLElement) => Node) {
    const doc = new Window().document;
    const root = doc.createElement('div') as unknown as HTMLElement;
    const el = (n: Node) => n as unknown as Element;
    root.innerHTML = html;
    let node = select(root);
    let transactions = 0;
    const ed: EditorLike & { transactions: () => number; root: HTMLElement; select: (n: Node) => void } = {
        root, transactions: () => transactions, select: (n) => { node = n; },
        selectionNode: () => node,
        closest: (n, sel) => ((n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest(sel) ?? null) as HTMLElement | null,
        setStyle: (el, n, v) => { if (v) el.style.setProperty(n, v); else el.style.removeProperty(n); },
        setImportantStyle: (el, n, v) => { if (v) el.style.setProperty(n, v, 'important'); else el.style.removeProperty(n); },
        setAttrib: (el, n, v) => { if (v === null) el.removeAttribute(n); else el.setAttribute(n, v); },
        addClass: (el, c) => el.classList.add(c),
        removeClass: (el, c) => el.classList.remove(c),
        transact: (fn) => { transactions++; fn(); },
        formatBlock: (tag) => { // troca a tag do bloco sob o cursor (como o FormatBlock do TinyMCE)
            const cur = el(node).closest('p,h1,h2,h3,h4,h5,h6')!;
            const next = doc.createElement(tag) as unknown as Element;
            next.innerHTML = cur.innerHTML; next.className = cur.className;
            cur.replaceWith(next); node = next;
        },
        applyFormat: (f) => { el(node).closest('p,li')!.classList.add(f); },
    };
    return ed;
}

test('inspect: parágrafo dentro de coluna dá text + grid; fora de caixas, box null', () => {
    const ed = fakeEditor('<div class="grid"><div class="col"><p class="p-quote">x</p></div></div>', (r) => r.querySelector('p')!);
    const info = inspectBlock(ed);
    expect(info.text).toMatchObject({ tag: 'p', classes: ['p-quote'] });
    expect(info.grid).toEqual(EMPTY_GRID);
    expect(info.box).toBeNull();
    expect(info.image).toBeNull();
});

test('inspect: imagem selecionada, e marcador de capítulo não é bloco de texto', () => {
    expect(inspectBlock(fakeEditor('<p><img alt="a"></p>', (r) => r.querySelector('img')!)).image?.alt).toBe('a');
    expect(inspectBlock(fakeEditor('<p class="chapter-break-h1" data-title="t"></p>', (r) => r.querySelector('p')!)).text).toBeNull();
});

test('apply: cada alvo escreve no elemento certo, num passo de undo', () => {
    const ed = fakeEditor('<div class="box"><p>x</p></div>', (r) => r.querySelector('p')!);
    applyBlockEdit(ed, { target: 'text', patch: { align: 'center' } });
    applyBlockEdit(ed, { target: 'box', patch: { variant: 'aviso', background: '#fff' } });
    expect(ed.root.querySelector('p')!.style.getPropertyPriority('text-align')).toBe('important');
    expect(ed.root.querySelector('.box')!.className).toBe('box box--aviso');
    expect(ed.transactions()).toBe(2);
    applyBlockEdit(ed, { target: 'image', patch: { alt: 'x' } }); // sem imagem selecionada: nada
    expect(ed.transactions()).toBe(2);
});

test('apply style: troca exclusiva, converte título↔parágrafo e preserva classes fora da lista', () => {
    const ed = fakeEditor('<p class="p-quote p-center">x</p>', (r) => r.querySelector('p')!);
    applyBlockEdit(ed, { target: 'style', format: 'h2' });
    expect(ed.root.firstElementChild!.nodeName).toBe('H2');
    expect(ed.root.firstElementChild!.className).toBe('p-center'); // p-quote saiu, p-center ficou
    applyBlockEdit(ed, { target: 'style', format: 'p-small' });
    expect(ed.root.firstElementChild!.nodeName).toBe('P');
    expect(ed.root.firstElementChild!.className).toBe('p-center p-small');
});

test('watcher só emite quando a informação muda', () => {
    const ed = fakeEditor('<p>a</p><p>b</p>', (r) => r.querySelector('p')!);
    const seen: unknown[] = [];
    const w = createBlockWatcher(ed, (i) => seen.push(i));
    w.update(); w.update();
    expect(seen.length).toBe(1);
    applyBlockEdit(ed, { target: 'text', patch: { indent: { n: 2, u: 'em' } } });
    w.update();
    expect(seen.length).toBe(2);
});

test('caixa/grelha selecionada pelo clique tem prioridade sobre o que rodeia o cursor; aplicar às células', () => {
    const ed = fakeEditor('<p id="x">fora</p><div class="grid"><div class="col"></div><p></p></div>', (r) => r.querySelector('#x')!);
    ed.selectedContainer = () => ed.root.querySelector('.grid') as HTMLElement;
    expect(inspectBlock(ed).grid).toEqual(EMPTY_GRID);     // cursor fora, mas a grelha está selecionada
    applyBlockEdit(ed, { target: 'grid', patch: { borderWidth: 2, borderStyle: 'solid', borderColor: '#000000' } });
    applyBlockEdit(ed, { target: 'gridCells' });
    expect((ed.root.querySelector('.col') as HTMLElement).style.borderWidth).toBe('2px');
    expect((ed.root.querySelector('.grid > p') as HTMLElement).style.borderStyle).toBe('solid');
});

test('apply class: junta e tira estilos sem afetar os outros', () => {
    const ed = fakeEditor('<p class="p-indent">x</p>', (r) => r.querySelector('p')!);
    applyBlockEdit(ed, { target: 'class', cls: 'p-bold', on: true });
    expect(ed.root.querySelector('p')!.className).toBe('p-indent p-bold');
    applyBlockEdit(ed, { target: 'class', cls: 'p-indent', on: false });
    expect(ed.root.querySelector('p')!.className).toBe('p-bold');
});
