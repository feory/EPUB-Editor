import { test, expect } from 'bun:test';
import { linkIndiceEntries, linkOneIndiceEntry } from './indice-links';

const toc = (body: string) => `<p class="chapter-break-h1" data-title="Índice"></p><h1>Índice</h1>${body}`;
const chapter = (n: string, title: string, body = '<p>corpo</p>') =>
    `<p class="chapter-break-h1" data-title="${title}"></p><h1>${title}</h1>${body}`;

test('linkIndiceEntries: match direto liga entrada ao capítulo', () => {
    const parts = [
        toc('<p>Um fantasma assombra o mundo . . . . . 358</p>'),
        chapter('1', 'Um fantasma assombra o mundo'),
    ];
    const { parts: out, linked, anchored } = linkIndiceEntries(parts);
    expect(linked).toBe(1);
    expect(anchored).toBe(1);
    expect(out[0]).toContain('<span class="idx-link" data-target="idx-anchor-1">');
    expect(out[1]).toContain('<p class="chapter-anchor" id="idx-anchor-1"></p>');
});

test('linkIndiceEntries: containment ignora prefixo "Capítulo N." e sufixo de pontos+página', () => {
    const parts = [
        toc('<p>Capítulo 9. Um fantasma assombra o mundo . . . . . 358</p>'),
        chapter('1', 'Um fantasma assombra o mundo'),
    ];
    const { linked } = linkIndiceEntries(parts);
    expect(linked).toBe(1);
});

test('linkIndiceEntries: título com menos de 3 chars nunca casa', () => {
    const parts = [
        toc('<p>Um capítulo qualquer com a letra A no meio . . . 5</p>'),
        chapter('1', 'A'),
    ];
    const { linked, anchored } = linkIndiceEntries(parts);
    expect(linked).toBe(0);
    expect(anchored).toBe(0);
});

test('linkIndiceEntries: sem capítulo Índice devolve tudo inalterado', () => {
    const parts = [chapter('1', 'Prefácio'), chapter('2', 'Um fantasma assombra o mundo')];
    const result = linkIndiceEntries(parts);
    expect(result.parts).toEqual(parts);
    expect(result.linked).toBe(0);
});

test('linkIndiceEntries: reexecução é idempotente (output byte-a-byte igual)', () => {
    const parts = [
        toc('<p>Um fantasma assombra o mundo . . . . . 358</p><p>Prefácio . . . 5</p>'),
        chapter('1', 'Um fantasma assombra o mundo'),
        chapter('2', 'Prefácio'),
    ];
    const first = linkIndiceEntries(parts);
    const second = linkIndiceEntries(first.parts);
    expect(second.parts).toEqual(first.parts);
    expect(second.linked).toBe(first.linked);
});

test('linkIndiceEntries: reordenar capítulos entre execuções continua a resolver por título', () => {
    const parts = [
        toc('<p>Um fantasma assombra o mundo . . . . . 358</p>'),
        chapter('1', 'Prefácio'),
        chapter('2', 'Um fantasma assombra o mundo'),
    ];
    const first = linkIndiceEntries(parts);
    expect(first.linked).toBe(1);

    // reordena: capítulo-alvo passa a vir antes do Prefácio, entre execuções
    const reordered = [first.parts[0], first.parts[2], first.parts[1]];
    const second = linkIndiceEntries(reordered);
    expect(second.linked).toBe(1);
    // a âncora deve estar agora na part que contém o título certo (índice 1 do array reordenado)
    expect(second.parts[1]).toContain('data-title="Um fantasma assombra o mundo"');
    expect(second.parts[1]).toMatch(/<p class="chapter-anchor" id="idx-anchor-1">/);
});

test('linkIndiceEntries: duas entradas para o mesmo capítulo só inserem uma âncora', () => {
    const parts = [
        toc('<p>Um fantasma assombra o mundo . . . . . 358</p><p>ver também Um fantasma assombra o mundo . . . 12</p>'),
        chapter('1', 'Um fantasma assombra o mundo'),
    ];
    const { parts: out, anchored } = linkIndiceEntries(parts);
    expect(anchored).toBe(1);
    const matches = out[1].match(/id="idx-anchor-1"/g) || [];
    expect(matches.length).toBe(1);
});

test('linkIndiceEntries: parts nível break nunca são alvo', () => {
    const parts = [
        toc('<p>Ficha Técnica . . . 2</p>'),
        '<p class="chapter-break" data-title="Ficha Técnica"></p><p>copyright</p>',
    ];
    const { linked, anchored } = linkIndiceEntries(parts);
    expect(linked).toBe(0);
    expect(anchored).toBe(0);
});

test('linkIndiceEntries: sub-entrada liga ao parágrafo p-bold dentro do capítulo corrente', () => {
    const parts = [
        toc('<p>Um fantasma assombra o mundo . . . 358</p><p>Introdução . . . 359</p><p>Conclusão . . . 365</p>'),
        chapter('1', 'Um fantasma assombra o mundo',
            '<p class="p-bold">Introdução</p><p>texto</p><p class="p-bold">Conclusão</p>'),
    ];
    const { parts: out, linked, anchored } = linkIndiceEntries(parts);
    expect(linked).toBe(3); // capítulo + 2 sub-entradas
    expect(anchored).toBe(1); // só 1 capítulo recebeu marcador de nível
    expect(out[1]).toMatch(/<p class="p-bold">Introdução<\/p><p class="chapter-anchor" id="idx-anchor-1-1">/);
    expect(out[1]).toMatch(/<p class="p-bold">Conclusão<\/p><p class="chapter-anchor" id="idx-anchor-1-2">/);
});

test('linkIndiceEntries: mesmo texto de sub-entrada ("Introdução") não cruza capítulos', () => {
    const parts = [
        toc('<p>Capítulo Um . . . 1</p><p>Introdução . . . 2</p><p>Capítulo Dois . . . 10</p><p>Introdução . . . 11</p>'),
        chapter('1', 'Capítulo Um', '<p class="p-bold">Introdução</p>'),
        chapter('2', 'Capítulo Dois', '<p class="p-bold">Introdução</p>'),
    ];
    const { parts: out, linked } = linkIndiceEntries(parts);
    expect(linked).toBe(4);
    // cada "Introdução" liga ao p-bold do SEU PRÓPRIO capítulo — âncoras com ids distintos,
    // cada uma dentro do capítulo certo (nunca cruza para o outro)
    const anchor1 = out[1].match(/idx-anchor-1-\d+/)?.[0];
    const anchor2 = out[2].match(/idx-anchor-2-\d+/)?.[0];
    expect(anchor1).toBeTruthy();
    expect(anchor2).toBeTruthy();
    expect(anchor1).not.toBe(anchor2);
    expect(out[0]).toContain(`data-target="${anchor1}"`);
    expect(out[0]).toContain(`data-target="${anchor2}"`);
});

test('linkIndiceEntries: título dividido em duas linhas do Índice ("PARTE III" + resto) casa por conteúdo', () => {
    const parts = [
        toc('<p>PARTE III</p><p>ECOLOGIAS DE SABERES JURÍDICOS</p>'),
        chapter('1', 'PARTE III  ECOLOGIAS DE SABERES JURÍDICOS'),
    ];
    const { linked, anchored } = linkIndiceEntries(parts);
    expect(linked).toBe(2);
    expect(anchored).toBe(1); // as duas linhas apontam ao mesmo capítulo, só 1 âncora de nível
});

test('linkIndiceEntries: reexecução não come o nº que faz parte do título ("Cena 1")', () => {
    const parts = [
        toc('<p>Cena 1 23</p><p>Cena 2 45</p>'),
        chapter('1', 'Cena 1'),
        chapter('2', 'Cena 2'),
    ];
    const first = linkIndiceEntries(parts);
    expect(first.linked).toBe(2);
    expect(first.parts[0]).toContain('>Cena 1</span>'); // nº de página (23) saiu, "1" do título ficou
    expect(first.parts[0]).toContain('>Cena 2</span>');

    const second = linkIndiceEntries(first.parts);
    expect(second.parts).toEqual(first.parts); // reexecução: byte-a-byte igual, "1"/"2" sobrevivem
    expect(second.linked).toBe(first.linked);
});

test('linkIndiceEntries: reexecução não corrompe entrada com <span> aninhado (pagebreak antes do título)', () => {
    const parts = [
        toc('<p><span class="pagebreak" data-page="7"></span>Dramatis Personae 19</p>'),
        chapter('1', 'Dramatis Personae'),
    ];
    const first = linkIndiceEntries(parts);
    expect(first.linked).toBe(1);
    expect(first.parts[0]).toContain('<span class="pagebreak" data-page="7"></span>Dramatis Personae</span>');

    const second = linkIndiceEntries(first.parts);
    expect(second.parts).toEqual(first.parts); // reexecução não parte a marcação nem duplica texto
    expect(second.linked).toBe(1);
});

test('linkIndiceEntries: reexecução com sub-entradas continua idempotente', () => {
    const parts = [
        toc('<p>Um fantasma assombra o mundo . . . 358</p><p>Introdução . . . 359</p>'),
        chapter('1', 'Um fantasma assombra o mundo', '<p class="p-bold">Introdução</p>'),
    ];
    const first = linkIndiceEntries(parts);
    const second = linkIndiceEntries(first.parts);
    expect(second.parts).toEqual(first.parts);
    expect(second.linked).toBe(first.linked);
});

test('linkIndiceEntries: variantes de título do Índice são detetadas, "Índice Remissivo" não', () => {
    for (const title of ['Índice', 'Sumário', 'Conteúdo', 'índice']) {
        const parts = [toc('')];
        parts[0] = `<p class="chapter-break-h1" data-title="${title}"></p><h1>${title}</h1><p>Prefácio . . . 5</p>`;
        parts.push(chapter('1', 'Prefácio'));
        const { linked } = linkIndiceEntries(parts);
        expect(linked).toBe(1);
    }

    const partsRemissivo = [
        chapter('1', 'Índice Remissivo', '<p>Democracia, 34, 56-58</p>'),
        chapter('2', 'Prefácio'),
    ];
    const result = linkIndiceEntries(partsRemissivo);
    expect(result.linked).toBe(0); // "Índice Remissivo" não é detetado como capítulo de TOC
});

test('linkIndiceEntries: título repetido em atos diferentes liga cada entrada ao capítulo certo (não sempre ao 1º)', () => {
    const parts = [
        toc('<p>Ato I</p><p>Cena 1 . . . 5</p><p>Ato II</p><p>Cena 1 . . . 40</p>'),
        chapter('1', 'Ato I'),
        chapter('2', 'Cena 1'),
        chapter('3', 'Ato II'),
        chapter('4', 'Cena 1'),
    ];
    const { parts: out, linked, anchored } = linkIndiceEntries(parts);
    expect(linked).toBe(4);
    expect(anchored).toBe(4);
    expect(out[0]).toContain('data-target="idx-anchor-2"'); // 1ª "Cena 1" → capítulo do Ato I
    expect(out[0]).toContain('data-target="idx-anchor-4"'); // 2ª "Cena 1" → capítulo do Ato II, não repete idx-anchor-2
});

test('linkOneIndiceEntry: liga o p-ésimo parágrafo do Índice ao capítulo escolhido', () => {
    const parts = [
        toc('<p>Introdução Qualquer Coisa</p><p>Um Capítulo Sem Nada A Ver</p>'),
        chapter('1', 'Prefácio'),
        chapter('2', 'Desenvolvimento'),
    ];
    // pIndex conta TODOS os <p>, incluindo o marcador chapter-break-h1 (pIndex 0) — mesma
    // contagem que o mini-menu faz sobre editor.getBody() (ver idxlinktarget em setup.ts).
    const { parts: out, ok } = linkOneIndiceEntry(parts, 0, 2, 2); // pIndex 2 = "Um Capítulo..." → capítulo 2
    expect(ok).toBe(true);
    expect(out[0]).toContain('<p><span class="idx-link" data-target="idx-anchor-2">Um Capítulo Sem Nada A Ver</span></p>');
    expect(out[0]).not.toContain('idx-anchor-1'); // 1ª entrada não tocada
    expect(out[2]).toContain('<p class="chapter-anchor" id="idx-anchor-2"></p>');
});

test('linkOneIndiceEntry: religar troca o alvo sem duplicar a âncora antiga', () => {
    const parts = [
        toc('<p>Entrada</p>'),
        chapter('1', 'Capítulo A'),
        chapter('2', 'Capítulo B'),
    ];
    const first = linkOneIndiceEntry(parts, 0, 1, 1); // pIndex 1 = "Entrada" (0 é o marcador chapter-break-h1)
    expect(first.ok).toBe(true);
    const second = linkOneIndiceEntry(first.parts, 0, 1, 2);
    expect(second.ok).toBe(true);
    expect(second.parts[0]).toContain('data-target="idx-anchor-2"');
    expect(second.parts[0]).not.toContain('idx-anchor-1');
});

test('linkOneIndiceEntry: liga a um capítulo cujo heading não vem logo a seguir ao marcador (ex. imagem antes do título)', () => {
    const parts = [
        toc('<p>Introdução</p>'),
        `<p class="chapter-break-h1" data-title="Introdução"></p><p><img src="capa.jpg"></p><h1>Introdução</h1><p>corpo</p>`,
    ];
    const { parts: out, ok } = linkOneIndiceEntry(parts, 0, 1, 1); // pIndex 1 = "Introdução" (0 é o marcador)
    expect(ok).toBe(true);
    expect(out[0]).toContain('data-target="idx-anchor-1"');
    expect(out[1]).toStartWith('<p class="chapter-break-h1" data-title="Introdução"></p><p class="chapter-anchor" id="idx-anchor-1"></p>');
});

test('linkOneIndiceEntry: pIndex ou capítulos fora de alcance devolve ok:false sem mexer nas parts', () => {
    const parts = [toc('<p>Entrada</p>'), chapter('1', 'Capítulo A')];
    const r1 = linkOneIndiceEntry(parts, 0, 5, 1); // pIndex inexistente
    expect(r1.ok).toBe(false);
    expect(r1.parts).toBe(parts);
    const r2 = linkOneIndiceEntry(parts, 0, 0, 9); // capítulo alvo inexistente
    expect(r2.ok).toBe(false);
});
