// HTML → parágrafos comparáveis (texto de p/h1/h2/h3, vazios descartados).
// Partilhado pela comparação com ficheiro (useDiffComparison) e pelo diff entre saves (useVersionDiff).
export function extractParagraphs(html: string): string[] {
    const div = document.createElement('div');
    div.innerHTML = html;
    return Array.from(div.querySelectorAll('p, h1, h2, h3'))
        .map(el => (el.textContent || '').trim())
        .filter(t => t.length > 0);
}

// Forma de cada parágrafo de `extractParagraphs` (mesma seleção e ordem → mesmos índices): tag, classes e
// style. Permite ao diff apontar parágrafos com o mesmo texto mas formatação diferente.
export function extractParagraphFormats(html: string): string[] {
    const div = document.createElement('div');
    div.innerHTML = html;
    return Array.from(div.querySelectorAll('p, h1, h2, h3'))
        .filter(el => (el.textContent || '').trim().length > 0)
        .map(el => {
            const classes = Array.from(el.classList).sort().join('.');
            const style = el.getAttribute('style')?.trim();
            return el.tagName.toLowerCase() + (classes ? `.${classes}` : '') + (style ? ` {${style}}` : '');
        });
}
