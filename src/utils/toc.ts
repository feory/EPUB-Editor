// Operações puras do Editor de TOC: reordenar (por subárvore) e renomear capítulos.
// Trabalham sobre as `parts` do split de capítulos (1:1 com `chapters[]`), sem tocar no DOM.

type Level = 'h1' | 'h2' | 'break';

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
