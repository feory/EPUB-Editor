// HTML → parágrafos comparáveis (texto de p/h1/h2/h3, vazios descartados).
// Partilhado pela comparação com ficheiro (useDiffComparison) e pelo diff entre saves (useVersionDiff).
export function extractParagraphs(html: string): string[] {
    const div = document.createElement('div');
    div.innerHTML = html;
    return Array.from(div.querySelectorAll('p, h1, h2, h3'))
        .map(el => (el.textContent || '').trim())
        .filter(t => t.length > 0);
}
