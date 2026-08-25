// Liga automaticamente as entradas do Índice do livro (página de conteúdo real, não o nav.xhtml
// do EPUB) aos capítulos correspondentes — e também às sub-secções dentro de cada capítulo
// (parágrafos "pseudo-heading" em negrito inteiro, classe `p-bold`, ex. "Introdução",
// "Conclusão" — repetem-se em vários capítulos, por isso só se procura dentro do capítulo a que
// a entrada pertence no Índice, nunca no livro inteiro). Opera sobre `parts: string[]` (mesma
// forma que chapterSync.splitHtmlIntoParts()) — puro, sem DOM/pdfjs, testável com bun test.
//
// Os dois marcadores usados (`idx-link`, `chapter-anchor`) nunca são `<a>`: cleanHtml() apaga
// qualquer `<a>` em cada load/save/export (regex `links`), por isso um link real morreria na
// próxima gravação. Só viram `<a href>` no export (ver src/services/epub/index-links.ts).

import { classifyChapterPart, matchChapterMarkerElement, flattenHeadingText } from './html-cleaner';
import { decodeEntities } from './entities';

// Cópia deliberada do normalize() de page-list.ts (não está exportado de lá, e esse ficheiro é
// conceptualmente sobre PDF/páginas, não texto genérico). classifyChapterPart já faz
// decodeEntities ao título do capítulo — o texto do Índice/sub-heading vem HTML cru (ex.
// "Pref&aacute;cio") e precisa do mesmo decode antes de normalizar, senão "á" nunca bate com
// "&aacute;".
function normalizeText(s: string): string {
    return decodeEntities(s).toLowerCase().replace(/[^0-9a-zà-öø-ÿ]/g, '');
}

const MIN_TITLE = 3; // mesma guarda de extractChapterAnchors (page-list.ts)

// Linha do Índice impresso ("4. A Lua 35") tem o nº de página colado ao fim, sem separador —
// sobrevive ao normalizeText (mantém dígitos) e quebra o match de substring contra o título do
// capítulo; sem uso depois de ligado, por isso sai também do texto visível. Tira só o último
// grupo de dígitos precedido de espaço (fim de string, sem tags a seguir).
function stripTrailingPageNum(s: string): string {
    return s.replace(/\s+\d+\s*$/, '');
}

// Casa nos dois sentidos: uma entrada do Índice pode ser mais longa que o título (prefixo
// "Capítulo N." + pontos de preenchimento + nº de página) OU mais curta (livros que partem um
// título composto em duas linhas do Índice, ex. "PARTE III" / "ECOLOGIAS DE SABERES JURÍDICOS"
// para um único heading "PARTE III  ECOLOGIAS DE SABERES JURÍDICOS").
function titlesMatch(lineNorm: string, titleNorm: string): boolean {
    return lineNorm.length >= MIN_TITLE && titleNorm.length >= MIN_TITLE &&
        (lineNorm.includes(titleNorm) || titleNorm.includes(lineNorm));
}

// Cópia deliberada de tocKeywords (src/services/pdf/heuristics.ts, módulo só de import de PDF) —
// match ANCORADO à string inteira, nunca confunde com "Índice Remissivo" (feature não
// relacionada, já servida por src/utils/index-cleaner.ts).
const TOC_TITLE = /^(índice|indice|sumário|sumario|conteúdo|conteudo|table of contents|contents)$/i;

function stripPart(part: string): string {
    return part
        // Lookahead até ao </p> (não só o 1º </span>): uma entrada do Índice pode ter um <span>
        // aninhado dentro do idx-link (ex. marcador de página "pagebreak" antes do título, ver
        // insertPageBreaks) — sem o lookahead, o [\s\S]*? não-guloso parava no </span> desse
        // marcador em vez do do próprio idx-link, cortava o resto do título fora do "$1" e
        // deixava a marcação por fechar (títulos a "colar-se" ao nº do pagelist na reexecução).
        .replace(/<span\b[^>]*\bclass="[^"]*\bidx-link\b[^"]*"[^>]*>([\s\S]*?)<\/span>(?=\s*<\/p>)/g, '$1')
        .replace(/<p\b[^>]*\bclass="[^"]*\bchapter-anchor\b[^"]*"[^>]*>[\s\S]*?<\/p>/g, '');
}

// Comprimento do prefixo "marcador + heading" no início de uma part h1/h2/h3 — 0 se não houver
// heading real a seguir ao marcador (quebra sem título / marcador corrompido).
function headingPrefixLength(part: string): number {
    const marker = matchChapterMarkerElement(part);
    if (!marker) return 0;
    const after = part.slice(marker.raw.length);
    const h = after.match(/^\s*<h[123][^>]*>[\s\S]*?<\/h[123]>/i);
    return h ? marker.raw.length + h[0].length : 0;
}

// Acha, dentro do conteúdo de UM capítulo, o 1º parágrafo p-bold ainda não usado cujo texto bata
// com `lineNorm`. `used` evita casar o mesmo parágrafo físico com duas entradas diferentes do
// Índice.
function findSubHeading(partContent: string, lineNorm: string, used: Set<number>): { start: number; end: number; headingNorm: string } | null {
    const re = /<p\b[^>]*\bclass="[^"]*\bp-bold\b[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(partContent)) !== null) {
        if (used.has(m.index)) continue;
        const headingNorm = normalizeText(flattenHeadingText(m[1]));
        if (titlesMatch(lineNorm, headingNorm)) return { start: m.index, end: m.index + m[0].length, headingNorm };
    }
    return null;
}

export interface LinkIndiceResult {
    parts: string[];
    linked: number;
    anchored: number;
}

export function linkIndiceEntries(rawParts: string[]): LinkIndiceResult {
    const parts = rawParts.map(stripPart); // reexecução idempotente: tira marcadores desta feature primeiro

    const classified = parts.map((p, i) => ({ i, ...classifyChapterPart(p, i) }));
    const prefixLen = new Map<number, number>();
    const candidates = classified.filter(c => {
        if (c.level === 'break' || normalizeText(c.title).length < MIN_TITLE) return false;
        const len = headingPrefixLength(parts[c.i]);
        if (len === 0) return false;
        prefixLen.set(c.i, len);
        return true;
    });

    const tocEntry = candidates.find(c => TOC_TITLE.test(c.title.trim()));
    if (!tocEntry) return { parts: rawParts, linked: 0, anchored: 0 };

    const targets = candidates.filter(c => c.i !== tocEntry.i);
    const tocPrefix = prefixLen.get(tocEntry.i)!;
    const before = parts[tocEntry.i].slice(0, tocPrefix);
    const body = parts[tocEntry.i].slice(tocPrefix);

    let linked = 0;
    let anchorSeq = 0;
    const anchoredChapters = new Set<number>();
    // por capítulo: âncoras de sub-secção a inserir (posição no conteúdo ORIGINAL desse capítulo)
    const subAnchorsByChapter = new Map<number, { pos: number; id: string }[]>();
    const usedSubHeadings = new Map<number, Set<number>>(); // capítulo → offsets de p-bold já usados
    let currentChapter: (typeof targets)[number] | null = null;

    const newBody = body.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (m, attrs, inner) => {
        const lineNorm = normalizeText(flattenHeadingText(inner));
        if (lineNorm.length < MIN_TITLE) return m;

        // 1. entrada de topo (capítulo/parte) — muda o "capítulo corrente" para as sub-entradas seguintes
        const topTarget = targets.find(t => titlesMatch(lineNorm, normalizeText(t.title)));
        if (topTarget) {
            currentChapter = topTarget;
            anchoredChapters.add(topTarget.i);
            linked++;
            // Só tira o nº de página impresso ("Cena 1 23" → "Cena 1") quando a linha tem mesmo
            // mais do que o título. Se já for exatamente o título normalizado (reexecução sobre
            // uma entrada já ligada, sem nº de página — ex. "Cena 1"), NÃO mexe:
            // stripTrailingPageNum não distingue nº de página de nº que faça parte do próprio
            // título, e comia-o numa 2ª execução ("Cena 1" → "Cena").
            const text = lineNorm === normalizeText(topTarget.title) ? inner : stripTrailingPageNum(inner);
            return `<p${attrs}><span class="idx-link" data-target="idx-anchor-${topTarget.i}">${text}</span></p>`;
        }

        // 2. sub-entrada — só procura DENTRO do capítulo corrente (mesmo texto repete-se entre capítulos)
        if (currentChapter) {
            const used = usedSubHeadings.get(currentChapter.i) ?? new Set<number>();
            const match = findSubHeading(parts[currentChapter.i], lineNorm, used);
            if (match) {
                used.add(match.start);
                usedSubHeadings.set(currentChapter.i, used);
                anchorSeq++;
                const id = `idx-anchor-${currentChapter.i}-${anchorSeq}`;
                const list = subAnchorsByChapter.get(currentChapter.i) ?? [];
                list.push({ pos: match.end, id });
                subAnchorsByChapter.set(currentChapter.i, list);
                linked++;
                const text = lineNorm === match.headingNorm ? inner : stripTrailingPageNum(inner);
                return `<p${attrs}><span class="idx-link" data-target="${id}">${text}</span></p>`;
            }
        }
        return m;
    });
    if (linked === 0) return { parts: rawParts, linked: 0, anchored: 0 };

    parts[tocEntry.i] = before + newBody;

    // insere as âncoras de cada capítulo (nível + sub-secções) numa só passagem, das posições
    // maiores para as menores — não desloca as posições ainda por inserir.
    const chaptersToPatch = new Set([...anchoredChapters, ...subAnchorsByChapter.keys()]);
    for (const chapterIdx of chaptersToPatch) {
        const insertions = (subAnchorsByChapter.get(chapterIdx) ?? []).slice();
        if (anchoredChapters.has(chapterIdx)) insertions.push({ pos: prefixLen.get(chapterIdx)!, id: `idx-anchor-${chapterIdx}` });
        insertions.sort((a, b) => b.pos - a.pos);
        let content = parts[chapterIdx];
        for (const { pos, id } of insertions) {
            content = content.slice(0, pos) + `<p class="chapter-anchor" id="${id}"></p>` + content.slice(pos);
        }
        parts[chapterIdx] = content;
    }

    return { parts, linked, anchored: anchoredChapters.size };
}
