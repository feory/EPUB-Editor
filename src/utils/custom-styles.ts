// Estilos de parágrafo criados pelo utilizador ("Mais estilos" → "Novo estilo…"): regras `.p-nome { … }`
// numa secção própria do CSS do livro. Regex para o formato deste projeto, não um parser CSS.
const SECTION = '/* === ESTILOS PERSONALIZADOS === */';
const SECTION_RE = /\/\* === ESTILOS PERSONALIZADOS === \*\/([\s\S]*?)(?=\/\* === |$)/;

/** "Epígrafe final" → "p-epigrafe-final" ('' se não sobrar nada utilizável). */
export function styleClassOf(name: string): string {
    const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^p-/, '');
    return slug ? `p-${slug}` : '';
}

/** A secção inteira (cabeçalho incluído), ou '' — o export recoloca-a se o corte do editor-only a apanhou. */
export const customStylesSection = (css: string): string => SECTION_RE.exec(css)?.[0].trimEnd() ?? '';

export function listCustomStyles(css: string): string[] {
    const body = SECTION_RE.exec(css)?.[1] ?? '';
    return [...body.matchAll(/\.([\w-]+)\s*\{/g)].map((m) => m[1]);
}

// Marcador a partir do qual o style.css é só do editor (cortado no export).
export const EDITOR_CSS_MARKER = '/* === EDITOR (não exportado para EPUB) === */';

/** Acrescenta `.cls { body }` à secção, que fica sempre ANTES da parte só-editor (move-a se lá estiver). */
export function addCustomStyle(css: string, cls: string, body: string): string {
    const rule = `    .${cls} { ${body.replace(/[{}]/g, '').trim()} }\n`;
    const m = SECTION_RE.exec(css);
    const marker = css.indexOf(EDITOR_CSS_MARKER);
    if (m && (marker === -1 || m.index < marker)) {
        const end = m.index + m[0].length;
        return `${css.slice(0, end).trimEnd()}\n${rule}${css.slice(end)}`;
    }
    const rest = m ? css.slice(0, m.index) + css.slice(m.index + m[0].length) : css;
    const section = `    ${SECTION}${(m?.[1] ?? '\n').trimEnd()}\n${rule}`;
    const at = rest.indexOf(EDITOR_CSS_MARKER);
    if (at === -1) return `${rest.trimEnd()}\n\n${section}`;
    // `at` cai a meio da linha do marcador (indentação): recuar até ao início dela.
    const lineStart = rest.lastIndexOf('\n', at) + 1;
    return `${rest.slice(0, lineStart).trimEnd()}\n\n${section}\n${rest.slice(lineStart)}`;
}
