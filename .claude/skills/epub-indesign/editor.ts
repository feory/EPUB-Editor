// Vocabulário do editor = classes definidas no CSS do editor (o DEFAULT_CSS da app, passado pela CLI,
// ou o style.css de um EPUB optimizado). Uma classe nova no editor passa a valer no skill sem listas à mão.
export function editorVocabulary(css: string): Set<string> {
    const classes = new Set<string>();
    for (const [, selectors] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^}]*\}/g)) {
        if (selectors.trim().startsWith('@')) continue;
        for (const [, c] of selectors.matchAll(/\.([A-Za-z_-][\w-]*)/g)) classes.add(c);
    }
    return classes;
}
