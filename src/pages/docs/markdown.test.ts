import { test, expect } from 'bun:test';
import { parseDoc, parseInline, sectionText, fold } from './markdown';
import editor from './content/editor.md?raw';
import comofazer from './content/comofazer.md?raw';
import assistente from './content/assistente.md?raw';

test('inline: negrito, itálico, código e ligações; "(*)" fica literal', () => {
    expect(parseInline('a **b** *c* `d` [e](doc:x)')).toEqual([
        { t: 'text', v: 'a ' }, { t: 'b', c: [{ t: 'text', v: 'b' }] }, { t: 'text', v: ' ' },
        { t: 'i', c: [{ t: 'text', v: 'c' }] }, { t: 'text', v: ' ' }, { t: 'code', v: 'd' }, { t: 'text', v: ' ' },
        { t: 'link', href: 'doc:x', c: [{ t: 'text', v: 'e' }] },
    ]);
    expect(parseInline('Separador (*) e mais')).toEqual([{ t: 'text', v: 'Separador (*) e mais' }]);
});

test('documento: título, introdução, secções com blocos', () => {
    const doc = parseDoc('# T\n\nIntro\n\n## 1. Um\n\ntexto\n\n- a\n- b\n\n1. x\n2. y\n\n> nota\n\n| H1 | H2 |\n|---|---|\n| a | b |\n\n### Sub\n\n## 2. Admin {admin}\n', 'd');
    expect(doc.title).toBe('T');
    expect(doc.lead).toHaveLength(1);
    expect(doc.sections.map((s) => [s.id, s.title, s.admin])).toEqual([['d-1-um', '1. Um', false], ['d-2-admin', '2. Admin', true]]);
    expect(doc.sections[0].blocks.map((b) => b.t)).toEqual(['p', 'ul', 'ol', 'quote', 'table', 'h3']);
    const table = doc.sections[0].blocks[4];
    expect(table.t === 'table' && table.rows).toHaveLength(1);
});

test('pesquisa ignora acentos e maiúsculas', () => {
    const doc = parseDoc('## Índice\n\nLigação das entradas\n', 'd');
    expect(fold(sectionText(doc.sections[0]))).toContain(fold('INDICE'));
    expect(fold(sectionText(doc.sections[0]))).toContain('ligacao');
});

test('os guias reais: títulos, secções com ids únicos e secção só-admin', () => {
    for (const [id, md] of [['editor', editor], ['comofazer', comofazer], ['assistente', assistente]] as const) {
        const doc = parseDoc(md, id);
        expect(doc.sections.length).toBeGreaterThan(5);
        const ids = doc.sections.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    }
    expect(parseDoc(editor, 'editor').sections.filter((s) => s.admin).map((s) => s.title)).toEqual(['15. Painel de administração']);
});
