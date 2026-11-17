// Ligações nas respostas do assistente: o modelo escreve [[cap:4]] ou [[cap:4,bloco:12]] (números do survey_book / find_text) e o
// painel desenha um botão que salta para lá. `bloco` = posição entre os blocos de topo do capítulo, como o `find_text` devolve.

export type AiLink = { chapter: number; block?: number };
export type AiPiece = string | AiLink;

const LINK = /\[\[cap:(\d+)(?:,\s*bloco:(\d+))?\]\]/g;

/** Parte o texto em pedaços: texto corrido e ligações, por ordem. */
export function splitLinks(text: string): AiPiece[] {
    const out: AiPiece[] = [];
    let last = 0;
    for (const m of text.matchAll(LINK)) {
        if (m.index > last) out.push(text.slice(last, m.index));
        out.push({ chapter: Number(m[1]), ...(m[2] !== undefined && { block: Number(m[2]) }) });
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

/** Quantos blocos de topo há nos capítulos antes de `chapter`: a posição do capítulo quando o editor mostra o livro todo. */
export const blockOffset = (parts: string[], chapter: number): number =>
    parts.slice(0, chapter).reduce((n, part) => n + new DOMParser().parseFromString(part, 'text/html').body.children.length, 0);
