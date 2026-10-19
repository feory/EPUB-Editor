// Os "parágrafos" que o diff compara e que o editor mostra: p/h1/h2/h3 com texto. UMA só seleção
// (getNonEmptyBlocks) para o diff entre saves, a comparação com ficheiro, o salto ao parágrafo e o editor —
// por isso os índices batem por construção (marcadores de capítulo e <p> vazios ficam de fora em todos).

const BLOCKS = 'p, h1, h2, h3';

export function getContentBlocks(container: Element): Element[] {
    return Array.from(container.querySelectorAll(BLOCKS));
}

/** Blocos com texto, na ordem do documento: o índice N do diff é o N-ésimo daqui. */
export function getNonEmptyBlocks(container: Element): Element[] {
    return getContentBlocks(container).filter(b => (b.textContent || '').trim().length > 0);
}

export interface Paragraph {
    text: string;
    /** tag.classes {style}, ex. `p.p-indent` — para apontar o mesmo texto com formatação diferente. */
    format: string;
}

export function paragraphsOf(html: string): Paragraph[] {
    const div = document.createElement('div');
    div.innerHTML = html;
    return getNonEmptyBlocks(div).map(el => {
        const classes = Array.from(el.classList).sort().join('.');
        const style = el.getAttribute('style')?.trim();
        return {
            text: (el.textContent || '').trim(),
            format: el.tagName.toLowerCase() + (classes ? `.${classes}` : '') + (style ? ` {${style}}` : ''),
        };
    });
}

export const extractParagraphs = (html: string): string[] => paragraphsOf(html).map(p => p.text);
