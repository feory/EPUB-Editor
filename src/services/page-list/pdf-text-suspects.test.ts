import { test, expect } from 'bun:test';
import '../indesign/happy-dom';
import { textSuspects } from './pdf-text-suspects';

const cap = (title: string, body: string) => `<p class="chapter-break-h1" data-title="${title}">&nbsp;</p><h1>${title}</h1>${body}`;

test('textSuspects: hífen partido em qualquer capítulo, com o capítulo e o texto à volta', () => {
    const r = textSuspects(cap('Um', '<p>Frase com instabili- dade no meio.</p>') + cap('Dois', '<ul><li>outra desvalori- zação aqui</li></ul>'));
    expect(r.map((s) => [s.chapter, s.kind, s.text])).toEqual([['Um', 'hifen-partido', 'instabili- dade'], ['Dois', 'hifen-partido', 'desvalori- zação']]);
    expect(r[0].context).toBe('Frase com instabili- dade no meio.');
});

test('textSuspects: "pré- e pós-guerra", maiúscula a seguir e travessão de diálogo não contam', () => {
    expect(textSuspects(cap('Um', '<p>a era pré- e pós-guerra, mono- ou bilingue, Al- Biruni, — disse ele</p>'))).toEqual([]);
});

test('textSuspects: palavras coladas só no Índice Remissivo (no corpo, palavras longas são normais)', () => {
    const r = textSuspects(cap('Um', '<p>uma palavraextraordinariamentelonga aqui</p>') + cap('ÍNDICE REMISSIVO', '<p>eadensidadeenergética, 169</p>'));
    expect(r.map((s) => [s.chapter, s.kind])).toEqual([['ÍNDICE REMISSIVO', 'palavras-coladas']]);
});

test('textSuspects: o mesmo trecho repetido no capítulo conta uma vez; um <li> com <p> não duplica', () => {
    const r = textSuspects(cap('Um', '<p>instabili- dade aqui</p><p>e instabili- dade ali</p><ul><li><p>instabili- dade</p></li></ul>'));
    expect(r).toHaveLength(1);
});
