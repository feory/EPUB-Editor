import { test, expect } from 'bun:test';
import '../indesign/happy-dom'; // DOMParser no bun
import { readNotes, noteLead, isNoteElement, isExponent } from './read-notes';
import { validateFootnotes } from '../validation/footnote-validator';

const marker = (n: number) => `<span class="pagebreak" data-page="${n}"></span>`;

test('noteLead: rodapé com parêntese, asterisco, nota do fim do capítulo e marcador de página à cabeça ou dentro do <sup>', () => {
    expect(noteLead('(<sup>1</sup>) texto', 'footnote')).toMatchObject({ marker: '1', kind: 'footnote' });
    expect(noteLead('(<sup>**</sup>) texto', 'footnote p-indent')).toMatchObject({ marker: '**', kind: 'footnote' });
    expect(noteLead('<sup>6</sup> Stephen Dowling', '')).toMatchObject({ marker: '6', kind: 'endnote' });
    expect(noteLead(`${marker(350)}<sup>6</sup> texto`, 'footnote')).toMatchObject({ marker: '6' }); // o data-page não é o número
    expect(noteLead(`<sup>${marker(351)}16</sup> texto`, '')).toMatchObject({ marker: '16', kind: 'endnote' });
    expect(noteLead('texto normal', '')).toBeNull();
    expect(noteLead('texto <sup>3</sup> no meio', '')).toBeNull();                 // referência no meio: não é nota
    expect(noteLead('sem número', 'footnote')).toMatchObject({ marker: '?', kind: 'footnote' });
});

test('readNotes: separa notas de referências (a <sup> que abre a nota não conta como referência)', () => {
    const html = '<p>Texto<sup>1</sup> e mais<sup>*</sup>.</p><p class="footnote">(<sup>*</sup>) Nota do tradutor</p><p><sup>1</sup> Nota do fim</p>';
    const { defs, refs } = readNotes(html);
    expect(defs.map((d) => [d.marker, d.kind, d.text])).toEqual([['*', 'footnote', 'Nota do tradutor'], ['1', 'endnote', 'Nota do fim']]);
    expect(refs.map((r) => r.marker)).toEqual(['1', '*']);
});

test('isNoteElement: o mesmo teste no DOM', () => {
    const doc = new DOMParser().parseFromString('<p id="a"><sup>2</sup> nota</p><p id="b">Corpo<sup>2</sup></p><p id="c" class="footnote">(<sup>1</sup>) x</p>', 'text/html');
    expect(['a', 'b', 'c'].map((id) => isNoteElement(doc.getElementById(id)))).toEqual([true, false, true]);
    expect(isNoteElement(null)).toBe(false);
});

test('validateFootnotes: notas do fim do capítulo contam como notas (antes eram "referências órfãs")', () => {
    const html = '<p>a<sup>1</sup> b<sup>2</sup></p><p><sup>1</sup> n1</p><p><sup>2</sup> n2</p>';
    const r = validateFootnotes(html);
    expect(r.issues).toEqual([]);
    expect([r.totalRefs, r.totalNotes]).toEqual([2, 2]);
});

test('validateFootnotes: um marcador de página à cabeça da nota não a troca por "350" nem a esconde', () => {
    const html = `<p>a<sup>6</sup></p><p class="footnote">${marker(350)}<sup>6</sup> Stephen Dowling</p>`;
    expect(validateFootnotes(html).issues).toEqual([]);
});

test('validateFootnotes: conta por marcador, por isso a numeração que recomeça em cada capítulo não esconde faltas', () => {
    // dois capítulos, cada um com 1 e 2; no 2.º falta a nota 2
    const html = '<p>a<sup>1</sup> b<sup>2</sup></p><p><sup>1</sup> n</p><p><sup>2</sup> n</p><p>c<sup>1</sup> d<sup>2</sup></p><p><sup>1</sup> n</p>';
    const issues = validateFootnotes(html).issues;
    expect(issues.map((i) => [i.type, i.marker])).toEqual([['orphan-ref', '2']]);
});

test('validateFootnotes: referência sem nota, nota sem referência e nota de rodapé sem número', () => {
    const html = '<p>a<sup>9</sup></p><p class="footnote">(<sup>3</sup>) solta</p><p class="footnote">sem número</p>';
    expect(validateFootnotes(html).issues.map((i) => [i.type, i.marker]).sort()).toEqual([['broken-link', '?'], ['orphan-note', '3'], ['orphan-ref', '9']]);
});

test('validateFootnotes: asteriscos do tradutor e números do autor no mesmo capítulo não se confundem', () => {
    const html = '<p>x<sup>*</sup> y<sup>1</sup></p><p class="footnote">(<sup>*</sup>) do T.</p><p><sup>1</sup> do autor</p>';
    expect(validateFootnotes(html).issues).toEqual([]);
});

test('isExponent: potências de dez e unidades (10<sup>12</sup>, m<sup>2</sup>) não são referências de nota', () => {
    expect(isExponent('(18 x 10', '12')).toBe(true);
    expect(isExponent('em 10', '3')).toBe(true);
    expect(isExponent('uma área de 5 km', '2')).toBe(true);
    expect(isExponent('2010', '5')).toBe(false);        // ano: o 10 faz parte do número
    expect(isExponent('no mundo', '12')).toBe(false);
    expect(isExponent('em 3 m', '12')).toBe(false);     // só ² e ³ contam como unidade
});

test('readNotes/validateFootnotes: um expoente não é referência (o aviso "Referência [12] sem nota correspondente")', () => {
    const html = '<p>Cerca de 18 terawatts (18 x 10<sup>12</sup> watts) e 5 km<sup>2</sup>, e um facto.<sup>12</sup></p><p class="footnote">(<sup>12</sup>) A nota.</p>';
    expect(readNotes(html).refs.map((r) => r.marker)).toEqual(['12']);
    expect(validateFootnotes(html).issues).toEqual([]);
});

test('isExponent: o expoente dentro de <span style> (o editor embrulha a cor) também se reconhece', () => {
    expect(isExponent('(18 x 10<span style="color: #000000;">', '12')).toBe(true);
    expect(validateFootnotes('<p>(18 x 10<span style="color: #000000;"><sup>12</sup></span> <em>watts</em>)</p>').issues).toEqual([]);
});
