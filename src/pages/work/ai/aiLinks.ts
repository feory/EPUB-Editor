// Ligações nas respostas do assistente: o modelo escreve [[cap:4]] ou [[cap:4,bloco:12]] (números do survey_book / find_text) e o
// painel desenha um botão que salta para lá. `bloco` = posição entre os blocos de topo do capítulo, como o `find_text` devolve.
// [[pdf:N]] = a página N do ficheiro PDF de impressão (1-based) e [[pag:N]] = a página com o número impresso N (folio): abrem o PDF nessa página.

export type AiLink = { chapter: number; block?: number } | { pdf: number } | { folio: number };
export type AiPiece = string | AiLink;

const LINK = /\[\[(?:cap:(\d+)(?:,\s*bloco:(\d+))?|(pdf|pag):(\d+))\]\]/g;

/** Parte o texto em pedaços: texto corrido e ligações, por ordem. */
export function splitLinks(text: string): AiPiece[] {
    const out: AiPiece[] = [];
    let last = 0;
    for (const m of text.matchAll(LINK)) {
        if (m.index > last) out.push(text.slice(last, m.index));
        out.push(m[3] ? (m[3] === 'pdf' ? { pdf: Number(m[4]) } : { folio: Number(m[4]) }) : { chapter: Number(m[1]), ...(m[2] !== undefined && { block: Number(m[2]) }) });
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

/** Quantos blocos de topo há nos capítulos antes de `chapter`: a posição do capítulo quando o editor mostra o livro todo. */
export const blockOffset = (parts: string[], chapter: number): number =>
    parts.slice(0, chapter).reduce((n, part) => n + new DOMParser().parseFromString(part, 'text/html').body.children.length, 0);
