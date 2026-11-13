import { test, expect } from 'bun:test';
import '../services/indesign/happy-dom'; // DOMParser no bun
import { surveyBook } from './book-survey';

const chapter = (title: string, body: string, tag = 'h1') =>
    `<p class="chapter-break-${tag}" data-title="${title}"></p><${tag}>${title}</${tag}>${body}`;

const parts = [
    chapter('Um', '<p class="chapter-anchor" id="a"></p><p>texto um</p><p class="p-quote p-small">citação</p>'),
    chapter('Sub', '<p>texto dois</p><p>texto três</p><div class="box"><p>dentro</p></div>', 'h2'),
];

test('capítulos: índice, título e nível', () => {
    expect(surveyBook(parts).chapters).toEqual([
        { index: 0, title: 'Um', level: 'h1' },
        { index: 1, title: 'Sub', level: 'h2' },
    ]);
});

test('blocos: contagem, nº de capítulos e exemplos, do mais frequente ao menos', () => {
    const { blocks } = surveyBook(parts);
    expect(blocks.find((b) => b.key === 'p')).toEqual({ key: 'p', count: 3, inChapters: 2, samples: ['texto um', 'texto dois'] });
    expect(blocks.find((b) => b.key === 'p.p-quote.p-small')).toEqual({ key: 'p.p-quote.p-small', count: 1, inChapters: 1, samples: ['citação'] });
    expect(blocks[0].key).toBe('p');
});

test('marcadores/âncoras não contam; só filhos diretos (parágrafo em caixa fica de fora)', () => {
    const keys = surveyBook(parts).blocks.map((b) => b.key);
    expect(keys.some((k) => k.includes('chapter-'))).toBe(false);
    expect(surveyBook(parts).blocks.find((b) => b.key === 'p')?.count).toBe(3);
    expect(keys).toContain('div.box');
});

test('maxBlocks corta os mais raros e diz quantos ficaram de fora', () => {
    const s = surveyBook(parts, '', 2);
    expect(s.blocks).toHaveLength(2);
    expect(s.omittedBlocks).toBeGreaterThan(0);
});

test('estilos do utilizador vêm do CSS do livro', () => {
    const css = '/* === ESTILOS PERSONALIZADOS === */\n    .p-destaque { font-size: 0.9em }\n';
    expect(surveyBook(parts, css).customStyles).toEqual(['p-destaque']);
    expect(surveyBook(parts).customStyles).toEqual([]);
});

test('allowedClasses: editor (sem as estruturais) + estilos do utilizador', () => {
    const css = '/* === ESTILOS PERSONALIZADOS === */\n    .p-destaque { font-size: 0.9em }\n';
    const { allowedClasses } = surveyBook(parts, css);
    expect(allowedClasses).toContain('p-quote');
    expect(allowedClasses).toContain('p-destaque');
    expect(allowedClasses).not.toContain('footnote');
    expect(allowedClasses).not.toContain('chapter-break');
});

test('styleRules: o corpo da regra de cada classe permitida que a tem no CSS', () => {
    const css = '/* === ESTILOS DE PARÁGRAFO === */\n    .p-quote { font-size: 0.85em !important; }\n';
    const { styleRules } = surveyBook(parts, css);
    expect(styleRules['p-quote']).toBe('font-size: 0.85em !important;');
    expect(styleRules['p-small']).toBeUndefined();
});

test('styleRules inclui as regras dos títulos h1–h3', () => {
    const css = '/* === PARÁGRAFOS === */\n    h2 { font-size: 1.5em; }\n';
    expect(surveyBook(parts, css).styleRules.h2).toBe('font-size: 1.5em;');
});

test('inlineStyles: os style inline mais comuns de cada padrão (só se houver)', () => {
    const withStyle = [chapter('Um', '<p style="margin-left: 2.15em;">a</p><p style="margin-left: 2.15em;">b</p><p style="color: red;">c</p><p>d</p>')];
    const p = surveyBook(withStyle).blocks.find((b) => b.key === 'p')!;
    expect(p.inlineStyles).toEqual([{ style: 'margin-left: 2.15em;', count: 2 }, { style: 'color: red;', count: 1 }]);
    expect(surveyBook(parts).blocks.find((b) => b.key === 'p')!.inlineStyles).toBeUndefined();
});
