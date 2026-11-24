// Erros que o PDF deixa no texto e que só se resolvem à mão (não se adivinha onde parte a palavra): quebra de linha com hífen ("instabili- dade")
// em qualquer capítulo, e palavras coladas ("eadensidadeenergética") no Índice Remissivo. Só se reportam; nada se corrige.

// "pré- e pós-guerra" (hífen suspensivo) tem o mesmo aspeto: com "e"/"ou" a seguir não conta.
const SPLIT_HYPHEN = /\p{L}{2,}- (?!(?:e|ou)\b)\p{Ll}\p{L}*/gu;
const GLUED_WORDS = /\p{L}{18,}/gu;   // as palavras mais longas do português dos índices têm 17 letras
const CONTEXT = 50;                   // chars de cada lado do trecho, para o localizar no texto

export interface TextSuspect {
    kind: 'hifen-partido' | 'palavras-coladas';
    chapter: string;
    /** O trecho suspeito. */
    text: string;
    /** O texto à volta (para o localizar). */
    context: string;
}

const isIndexChapter = (title: string) => /^[ií]ndice remissivo/i.test(title.trim());

/** Os suspeitos de um conjunto de blocos de texto de UM capítulo. `glued`: procurar também palavras coladas (só no Índice Remissivo). */
export function suspectsInBlocks(blocks: string[], chapter: string, glued: boolean): TextSuspect[] {
    const found = new Map<string, TextSuspect>();
    for (const raw of blocks) {
        const block = raw.replace(/\s+/g, ' ').trim();
        const scan = (kind: TextSuspect['kind'], re: RegExp) => {
            for (const m of block.matchAll(re)) {
                if (found.has(m[0])) continue;
                const at = m.index ?? 0;
                const context = `${at > CONTEXT ? '…' : ''}${block.slice(Math.max(0, at - CONTEXT), at + m[0].length + CONTEXT)}${at + m[0].length + CONTEXT < block.length ? '…' : ''}`;
                found.set(m[0], { kind, chapter, text: m[0], context });
            }
        };
        scan('hifen-partido', SPLIT_HYPHEN);
        if (glued) scan('palavras-coladas', GLUED_WORDS);
    }
    return [...found.values()];
}

/** Todos os suspeitos do livro, por capítulo (cada trecho só uma vez por capítulo). */
export function textSuspects(html: string): TextSuspect[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const byChapter: { chapter: string; blocks: string[] }[] = [{ chapter: '', blocks: [] }];
    for (const el of Array.from(doc.body.querySelectorAll('p, li'))) {
        if (el.tagName === 'P' && /(^| )chapter-break/.test(el.className)) { byChapter.push({ chapter: (el.getAttribute('data-title') ?? '').trim(), blocks: [] }); continue; }
        if (el.tagName === 'LI' && el.querySelector('p')) continue; // o texto já vem dos <p> de dentro
        byChapter[byChapter.length - 1].blocks.push(el.textContent ?? '');
    }
    return byChapter.flatMap(({ chapter, blocks }) => suspectsInBlocks(blocks, chapter, isIndexChapter(chapter)));
}
