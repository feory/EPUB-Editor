// Operações puras do Editor de TOC: reordenar (por subárvore) e renomear capítulos.
// Trabalham sobre as `parts` do split de capítulos (1:1 com `chapters[]`), sem tocar no DOM.

import { HR_BREAK_PATTERN, matchChapterMarkerElement } from './html-cleaner';

type Level = 'h1' | 'h2' | 'h3' | 'break';

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
 * Elimina a subárvore de `index` (h1 → o próprio + h2/breaks filhos; h2/break → só o próprio).
 * Devolve o novo fullHtml (partes juntas).
 */
export function deleteChapterPart(parts: string[], levels: Level[], index: number): string {
    const [s, e] = subtreeRange(levels, index);
    return [...parts.slice(0, s), ...parts.slice(e)].join('');
}

/**
 * Renomeia uma parte de capítulo: atualiza o `data-title` do marcador e, se existir, o texto
 * do heading (h1/h2) seguinte. Título vazio (break sem título) só limpa o data-title.
 */
export function renameChapterPart(part: string, newTitle: string): string {
    const safe = escapeHtml(newTitle.trim());
    let out = part.replace(
        /(class=["'][^"']*chapter-break[^"']*["'][^>]*data-title=["'])[^"']*(["'])/i,
        `$1${safe}$2`,
    );
    // Texto do heading a seguir ao marcador (mantém a tag/atributos, substitui o interior).
    out = out.replace(/(<(h[1-6])[^>]*>)[\s\S]*?(<\/\2>)/i, `$1${safe}$3`);
    return out;
}

/**
 * Muda o nível de uma parte de capítulo (h1/h2/h3/break), preservando o título.
 *  - heading → `break`: heading vira `<p>` comum, marcador perde o sufixo -hN.
 *  - `break` → heading: promove o data-title do marcador a heading novo.
 *  - heading → heading: só troca marcador + tag do heading.
 * `<hr class="chapter-break">` legacy é normalizado para o marcador `<p>` ao mudar de nível.
 */
export function changeChapterLevel(part: string, newLevel: Level): string {
    const hrMatch = part.match(HR_BREAK_PATTERN);
    const marker = hrMatch ? null : matchChapterMarkerElement(part);
    const rawMarker = hrMatch?.[0] ?? marker?.raw;
    if (!rawMarker) return part;

    const title = marker ? marker.title : (part.match(/data-title=["']([^"']*)["']/i)?.[1] ?? '');
    const rest = part.slice(rawMarker.length);
    const headingMatch = rest.match(/^\s*<(h[123])[^>]*>([\s\S]*?)<\/\1>/i);

    if (newLevel === 'break') {
        const newRest = headingMatch ? `<p>${headingMatch[2]}</p>${rest.slice(headingMatch[0].length)}` : rest;
        return `<p class="chapter-break" data-title="${title}"></p>${newRest}`;
    }

    const n = newLevel.slice(1);
    const newMarker = `<p class="chapter-break-h${n}" data-title="${title}"></p>`;
    if (headingMatch) return `${newMarker}<h${n}>${headingMatch[2]}</h${n}>${rest.slice(headingMatch[0].length)}`;
    return `${newMarker}<h${n}>${title}</h${n}>${rest}`;
}
