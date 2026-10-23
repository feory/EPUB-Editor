// Operações puras do Editor de TOC: reordenar (por subárvore) e renomear capítulos.
// Trabalham sobre as `parts` do split de capítulos (1:1 com `chapters[]`), sem tocar no DOM.

import { decodeEntities } from './entities';
import { matchChapterBoundary, isExplicitH1Part, chapterMarkerHtml, retitleMarkerTag, type ChapterLevel as Level } from './chapters';

const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Intervalo [start, end) da subárvore de um capítulo:
 *  - h1 → o próprio + tudo até ao próximo h1 (h2/breaks filhos);
 *  - h2/break → só o próprio (folha).
 */
export function subtreeRange(levels: Level[], i: number): [number, number] {
    if (levels[i] !== 'h1') return [i, i + 1];
    let end = i + 1;
    while (end < levels.length && levels[end] !== 'h1') end++;
    return [i, end];
}

/**
 * Move a subárvore de `from` para antes de `to` (índice no array original; `parts.length` = fim).
 * Devolve o novo fullHtml (partes juntas). No-op se `to` cair dentro da própria subárvore.
 */
export function moveChapters(parts: string[], levels: Level[], from: number, to: number): string {
    const [s, e] = subtreeRange(levels, from);
    if (to >= s && to <= e) return parts.join(''); // soltar dentro da própria subárvore → nada
    const block = parts.slice(s, e);
    const rest = [...parts.slice(0, s), ...parts.slice(e)];
    const insert = to < s ? to : to - block.length; // remoção do bloco desloca índices à direita
    rest.splice(Math.max(0, Math.min(insert, rest.length)), 0, ...block);
    return rest.join('');
}

/**
 * Capítulo novo (h1 com título), antes do primeiro h1 EXPLÍCITO (marcador -h1) — ou no topo se não há. Nunca antes
 * das quebras planas do início (Frontespício, Ficha Técnica…): elas também contam como h1 na estrutura, mas são o
 * que vem antes dos capítulos. Devolve o novo fullHtml.
 */
export function insertChapterPart(parts: string[], title: string): string {
    const part = `${changeChapterLevel(chapterMarkerHtml(null, escapeHtml(title)), 'h1')}<p></p>`;
    const firstH1 = parts.findIndex(isExplicitH1Part);
    const at = firstH1 === -1 ? 0 : firstH1;
    return [...parts.slice(0, at), part, ...parts.slice(at)].join('');
}

/**
 * Elimina a subárvore de `index` (h1 → o próprio + h2/breaks filhos; h2/break → só o próprio).
 * Devolve o novo fullHtml (partes juntas).
 */
export function deleteChapterPart(parts: string[], levels: Level[], index: number): string {
    const [s, e] = subtreeRange(levels, index);
    return [...parts.slice(0, s), ...parts.slice(e)].join('');
}

/**
 * Duplica a subárvore de `index` (h1 → o próprio + filhos) logo a seguir a ela. A cópia perde os `id` (duplicados
 * partiriam links/notas: ficam a apontar para o original) e o 1.º título ganha " (cópia)". Devolve o novo fullHtml.
 */
export function duplicateChapterPart(parts: string[], levels: Level[], index: number): string {
    const [s, e] = subtreeRange(levels, index);
    const copy = parts.slice(s, e).map(p => p.replace(/\s+id=("[^"]*"|'[^']*')/gi, ''));
    const title = matchChapterBoundary(copy[0])?.title ?? '';
    copy[0] = renameChapterPart(copy[0], `${decodeEntities(title)} (cópia)`.trim());
    return [...parts.slice(0, e), ...copy, ...parts.slice(e)].join('');
}

/**
 * Renomeia uma parte de capítulo: só atualiza o `data-title` do marcador (a entrada da
 * Estrutura/TOC). Nunca toca no heading (h1/h2/h3) do corpo — o botão de editar muda o
 * capítulo, não o título escrito no editor; o inverso (editar o heading) também não
 * mexe no data-title, ver refreshChapterMarkers em html-cleaner.ts.
 */
export function renameChapterPart(part: string, newTitle: string): string {
    const safe = escapeHtml(newTitle.trim());
    // Parte sem marcador (quebra implícita): o 1.º rename cria o marcador plano.
    if (!matchChapterBoundary(part)) return `${chapterMarkerHtml(null, safe)}${part}`;
    const open = part.match(/^<(?:p|hr)\b[^>]*>/i)![0];
    return retitleMarkerTag(open, safe) + part.slice(open.length);
}

/**
 * Muda o nível de uma parte de capítulo (h1/h2/h3/break), preservando o título.
 *  - heading → `break`: heading vira `<p>` comum, marcador perde o sufixo -hN.
 *  - `break` → heading: promove o data-title do marcador a heading novo.
 *  - heading → heading: só troca marcador + tag do heading.
 * `<hr class="chapter-break">` legacy é normalizado para o marcador `<p>` ao mudar de nível.
 */
export function changeChapterLevel(part: string, newLevel: Level): string {
    const boundary = matchChapterBoundary(part);
    if (!boundary) return part;

    const title = boundary.title;
    const rest = part.slice(boundary.raw.length);
    const headingMatch = rest.match(/^\s*<(h[123])[^>]*>([\s\S]*?)<\/\1>/i);

    if (newLevel === 'break') {
        const newRest = headingMatch ? `<p>${headingMatch[2]}</p>${rest.slice(headingMatch[0].length)}` : rest;
        return `${chapterMarkerHtml(null, title)}${newRest}`;
    }

    const n = newLevel.slice(1);
    const newMarker = chapterMarkerHtml(`h${n}` as 'h1' | 'h2' | 'h3', title);
    if (headingMatch) return `${newMarker}<h${n}>${headingMatch[2]}</h${n}>${rest.slice(headingMatch[0].length)}`;
    return `${newMarker}<h${n}>${title}</h${n}>${rest}`;
}
