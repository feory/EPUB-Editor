import { test, expect } from 'bun:test';
import '../../../services/indesign/happy-dom'; // DOMParser no bun
import { splitLinks, blockOffset } from './aiLinks';

test('splitLinks: texto e ligações por ordem, com ou sem bloco', () => {
    expect(splitLinks('Está em [[cap:4,bloco:12]] e também em [[cap:7]].')).toEqual(['Está em ', { chapter: 4, block: 12 }, ' e também em ', { chapter: 7 }, '.']);
    expect(splitLinks('sem ligações')).toEqual(['sem ligações']);
    expect(splitLinks('[[cap:0]]')).toEqual([{ chapter: 0 }]);
});

test('splitLinks: marcas mal formadas ficam como texto', () => {
    expect(splitLinks('[[cap:x]] [[cap:]] [[bloco:3]]')).toEqual(['[[cap:x]] [[cap:]] [[bloco:3]]']);
});

test('blockOffset: blocos de topo dos capítulos anteriores (posição no livro todo)', () => {
    const parts = ['<p>a</p><p>b</p>', '<h1>t</h1>', '<p>c</p><p>d</p><p>e</p>'];
    expect([0, 1, 2, 3].map((c) => blockOffset(parts, c))).toEqual([0, 2, 3, 6]);
});
