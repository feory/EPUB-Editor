import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { copyHtml, duplicate, insertEmptyParagraph, snapshotStyles, applyStyles, groupInBox, ungroup, boxOf, containerOf } from './blockMenu';

const body = (html: string) => {
    const b = new Window().document.createElement('div') as unknown as HTMLElement;
    b.innerHTML = html;
    return b;
};

test('copiar/duplicar limpam as marcas data-mce-*; imagem age sobre o seu parágrafo', () => {
    const b = body('<p class="p-quote" data-mce-psactive="1" data-mce-style="x"><img alt="a">t</p>');
    expect(copyHtml(b.querySelector('img')!)).toBe('<p class="p-quote"><img alt="a">t</p>');
    duplicate(b.querySelector('img')!);
    expect(b.children.length).toBe(2);
    expect(b.children[1].hasAttribute('data-mce-psactive')).toBe(false);
});

test('inserir antes/depois cria parágrafo vazio no sítio certo', () => {
    const b = body('<p id="a">a</p><p id="b">b</p>');
    insertEmptyParagraph(b.querySelector('#a')!, 'after');
    insertEmptyParagraph(b.querySelector('#b')!, 'before');
    expect(Array.from(b.children).map((c) => c.id || '·').join('')).toBe('a··b');
});

test('copiar/colar estilos: substitui classes e style, mantém o texto e ignora classes de UI', () => {
    const b = body('<p class="p-center p-bold mce-x" style="margin-top:2em">fonte</p><p class="p-quote" style="color:red">alvo</p>');
    const snap = snapshotStyles(b.children[0]);
    expect(snap).toEqual({ classes: ['p-center', 'p-bold'], style: 'margin-top:2em' });
    applyStyles(b.children[1], snap);
    expect(b.children[1].className).toBe('p-center p-bold');
    expect(b.children[1].getAttribute('style')).toBe('margin-top:2em');
    expect(b.children[1].textContent).toBe('alvo');
});

test('agrupar numa caixa e desagrupar repõem o original', () => {
    const b = body('<p id="p">x</p>');
    const box = groupInBox(b.querySelector('#p')!);
    expect(b.innerHTML).toBe('<div class="box"><p id="p">x</p></div>');
    expect(boxOf(b.querySelector('#p')!)).toBe(box);
    ungroup(box);
    expect(b.innerHTML).toBe('<p id="p">x</p>');
});

test('containerOf encontra colunas ou caixa à volta', () => {
    const b = body('<div class="grid"><div class="col"><p id="p">x</p></div></div><p id="q">y</p>');
    expect(containerOf(b.querySelector('#p')!)?.className).toBe('grid');
    expect(containerOf(b.querySelector('#q')!)).toBeNull();
});

test('se o elemento é uma caixa, boxOf devolve-a e Desagrupar desfaz só essa caixa', () => {
    const b = body('<div class="box"><div class="grid"><p>x</p></div></div>');
    const box = b.querySelector('.box')!;
    expect(boxOf(box)).toBe(box);
    ungroup(box);
    expect(b.innerHTML).toBe('<div class="grid"><p>x</p></div>');
});
