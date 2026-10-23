// Folha de estilos do livro (style.css): o module que sabe as suas secções e como ela muda de forma entre o
// EDITOR (tudo) e o EXPORT (sem a parte só-editor). Dono dos marcadores de secção e dos estilos de parágrafo
// criados pelo utilizador (`.p-nome { … }` numa secção própria). Regex para o formato deste projeto, não um parser CSS.
//   forEditor(css)  — corrige livros antigos e acrescenta as regras-base em falta
//   forExport(css)  — o que vai para o EPUB: corta a parte só-editor (mantendo os estilos personalizados)
//   createCustomStyle / listCustomStyles / styleClassOf — estilos personalizados
import { ensureBaselineCss } from './baseline-css';
import { hasRule } from './css-rule';
import { isCharStyle } from './char-styles';

const SECTION = '/* === ESTILOS PERSONALIZADOS === */';
const SECTION_RE = /\/\* === ESTILOS PERSONALIZADOS === \*\/([\s\S]*?)(?=\/\* === |$)/;

/** "Epígrafe final" → "p-epigrafe-final" ('' se não sobrar nada utilizável). */
export function styleClassOf(name: string): string {
    const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^p-/, '');
    return slug ? `p-${slug}` : '';
}

/** A secção inteira (cabeçalho incluído), ou '' — o export recoloca-a se o corte do editor-only a apanhou. */
const customStylesSection = (css: string): string => SECTION_RE.exec(css)?.[0].trimEnd() ?? '';

const customClasses = (css: string): string[] => [...(SECTION_RE.exec(css)?.[1] ?? '').matchAll(/\.([\w-]+)\s*\{/g)].map((m) => m[1]);

/** Estilos de PARÁGRAFO criados pelo utilizador. */
export const listCustomStyles = (css: string): string[] => customClasses(css).filter((c) => !isCharStyle(c));

/** Estilos de CARACTERES criados pelo utilizador (`.c-nome`). */
export const listCharStyles = (css: string): string[] => customClasses(css).filter(isCharStyle);

// Marcador a partir do qual o style.css é só do editor (cortado no export).
const EDITOR_CSS_MARKER = '/* === EDITOR (não exportado para EPUB) === */';

/** Acrescenta `.cls { body }` à secção, que fica sempre ANTES da parte só-editor (move-a se lá estiver). */
function addCustomStyle(css: string, cls: string, body: string): string {
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

/** Cria o estilo `.cls`, ou devolve o erro (já existe). */
export function createCustomStyle(css: string, cls: string, body: string): { css: string } | { error: string } {
    if (hasRule(css, `.${cls}`)) return { error: `Já existe um estilo ".${cls}".` };
    return { css: addCustomStyle(css, cls, body) };
}

/** Corrige o style.css guardado de livros antigos (marcador de capítulo, fontes) e acrescenta as regras-base em falta. */
export function forEditor(css: string): string {
    // Marcador de capítulo: retirar o prefixo "Capítulo - " (livros antigos guardaram-no no CSS).
    css = css.replace(/content:\s*"Cap[íi]tulo - "\s+attr\(data-title\)/g, 'content: attr(data-title)');
    // Fonte Crimson Text: livros gravados antes da correção tinham "Fonts/…" (relativo — dentro do
    // srcdoc do TinyMCE resolvia contra a URL da página, ex. /work/Fonts/…, nunca contra a raiz onde
    // os .ttf realmente estão servidos). Só troca ESTE ficheiro específico (não generaliza a outros
    // url("Fonts/…") que possam existir, ex. os do export EPUB).
    css = css.replace(/url\(["']?Fonts\/(CrimsonText-[\w]+\.ttf)["']?\)/g, 'url("/$1")');
    return ensureBaselineCss(css, 'editor');
}

/** O CSS que vai para o EPUB: sem a secção só-editor, mas com os estilos personalizados (que o editor escreve depois do marcador em livros antigos) e as regras-base do export. */
export function forExport(css: string): string {
    const i = css.indexOf(EDITOR_CSS_MARKER);
    let kept = css;
    if (i !== -1) {
        kept = css.slice(0, i).trimEnd();
        const custom = customStylesSection(css);
        if (custom && !kept.includes(custom)) kept = `${kept}\n\n${custom}`;
    }
    return ensureBaselineCss(kept, 'export');
}
