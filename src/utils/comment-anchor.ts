/**
 * Âncora de Comment no HTML do livro: `<span class="comment-anchor" data-comment-id="ID">texto</span>`.
 * `unwrapCommentAnchor` tira o span (e o par de fecho, mesmo com spans aninhados dentro) e deixa o
 * texto — para o livro INTEIRO em string, sem precisar do capítulo montado no editor.
 */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function unwrapCommentAnchor(html: string, anchorId: string): string {
    const open = new RegExp(`<span\\b[^>]*\\bdata-comment-id=["']${escapeRe(anchorId)}["'][^>]*>`, 'i').exec(html);
    if (!open) return html;
    const from = open.index + open[0].length;
    const tags = /<(\/?)span\b[^>]*>/gi;
    tags.lastIndex = from;
    let depth = 1;
    let m: RegExpExecArray | null;
    while ((m = tags.exec(html))) {
        depth += m[1] ? -1 : 1;
        if (depth === 0) return html.slice(0, open.index) + html.slice(from, m.index) + html.slice(m.index + m[0].length);
    }
    return html; // span sem fecho (HTML partido): não mexe
}
