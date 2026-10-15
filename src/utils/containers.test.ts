import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { removeElement, isColumnPlaceholder, GRID_HTML } from './containers';

const body = (html: string) => {
    const b = new Window().document.createElement('div') as unknown as HTMLElement;
    b.innerHTML = html;
    return b;
};

test('remover o único parágrafo de uma coluna deixa um parágrafo vazio (coluna continua editável)', () => {
    const b = body('<div class="box"><div class="grid"><div class="col"><p>x</p></div></div></div>');
    const p = b.querySelector('p')!;
    expect(removeElement(p, b)).toBeNull();
    expect(b.querySelector('.col')!.innerHTML).toBe('<p><br data-mce-bogus="1"></p>');
});

test('remover a última célula deixa a grelha vazia (válida)', () => {
    const b = body(GRID_HTML.replace('></div>', '><p>x</p></div>'));
    removeElement(b.querySelector('p')!, b);
    expect(b.innerHTML).toBe(GRID_HTML);
});

test('remover o único bloco de uma caixa remove a caixa; devolve o vizinho', () => {
    const b = body('<p>antes</p><div class="box"><p>x</p></div><p>depois</p>');
    const next = removeElement(b.querySelector('.box p')!, b);
    expect(b.innerHTML).toBe('<p>antes</p><p>depois</p>');
    expect(next).toBeNull(); // sem irmãos dentro da caixa; o chamador usa a posição
});

test('imagem sozinha no parágrafo leva o parágrafo; com texto só sai a imagem', () => {
    const b = body('<p><img alt="a"></p><p>t <img alt="b"></p>');
    removeElement(b.querySelectorAll('img')[0], b);
    expect(b.innerHTML).toBe('<p>t <img alt="b"></p>');
    removeElement(b.querySelector('img')!, b);
    expect(b.innerHTML).toBe('<p>t </p>');
});

test('isColumnPlaceholder só para o único filho de uma coluna', () => {
    const b = body('<div class="col"><p id="a"></p></div><div class="col"><p id="b"></p><p id="c"></p></div>');
    expect(isColumnPlaceholder(b.querySelector('#a')!)).toBe(true);
    expect(isColumnPlaceholder(b.querySelector('#b')!)).toBe(false);
});
