import { test, expect } from 'bun:test';
import { buildIdToSectionMap, convertIndexLinks } from './index-links';
import type { Section } from './types';

const section = (content: string): Section => ({ title: '', content, level: 'h1', parentIdx: -1, childIndices: [] });

test('buildIdToSectionMap: mapeia ids para o nº de secção 1-based', () => {
    const sections = [
        section('<p>Índice</p>'),
        section('<h1>Cap</h1><p class="chapter-anchor" id="idx-anchor-2"></p>'),
        section('<h1>Cap2</h1><p class="chapter-anchor" id="idx-anchor-3"></p>'),
    ];
    const map = buildIdToSectionMap(sections);
    expect(map.get('idx-anchor-2')).toBe(2);
    expect(map.get('idx-anchor-3')).toBe(3);
    expect(map.has('idx-anchor-99')).toBe(false);
});

test('convertIndexLinks: alvo na mesma secção usa #id', () => {
    const idToSection = new Map([['idx-anchor-1', 2]]);
    const html = '<p><span class="idx-link" data-target="idx-anchor-1">Capítulo 1</span></p>';
    const out = convertIndexLinks(html, idToSection, 2);
    expect(out).toBe('<p><a href="#idx-anchor-1">Capítulo 1</a></p>');
});

test('convertIndexLinks: alvo noutra secção usa sectionN.xhtml#id', () => {
    const idToSection = new Map([['idx-anchor-1', 3]]);
    const html = '<p><span class="idx-link" data-target="idx-anchor-1">Capítulo 1</span></p>';
    const out = convertIndexLinks(html, idToSection, 1);
    expect(out).toBe('<p><a href="section3.xhtml#idx-anchor-1">Capítulo 1</a></p>');
});

test('convertIndexLinks: id sem correspondência desembrulha para texto simples', () => {
    const idToSection = new Map<string, number>();
    const html = '<p><span class="idx-link" data-target="idx-anchor-9">Capítulo 9</span></p>';
    const out = convertIndexLinks(html, idToSection, 1);
    expect(out).toBe('<p>Capítulo 9</p>');
});

test('convertIndexLinks: tolera ordem de atributos diferente', () => {
    const idToSection = new Map([['idx-anchor-1', 1]]);
    const html = '<p><span data-target="idx-anchor-1" class="idx-link">Capítulo 1</span></p>';
    const out = convertIndexLinks(html, idToSection, 1);
    expect(out).toBe('<p><a href="#idx-anchor-1">Capítulo 1</a></p>');
});

test('convertIndexLinks: conteúdo com <span> aninhado (marcador de page-list) não corrompe a tag', () => {
    // Entrada do Índice cai no mesmo <p> que um marcador de page-list — [\s\S]*? sozinho parava
    // no 1º </span> (o do span aninhado), truncando o <a> a meio ("span vs a mismatch" no leitor).
    const idToSection = new Map([['idx-anchor-4', 4]]);
    const html = '<p><span class="idx-link" data-target="idx-anchor-4"><span class="pagebreak" data-page="5"></span>ECOLOGIAS DE SABERES</span></p>';
    const out = convertIndexLinks(html, idToSection, 1);
    expect(out).toBe('<p><a href="section4.xhtml#idx-anchor-4"><span class="pagebreak" data-page="5"></span>ECOLOGIAS DE SABERES</a></p>');
});
