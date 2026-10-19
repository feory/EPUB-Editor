// Regras-base que o CSS de um livro tem de ter. Livros antigos (style.css guardado antes de uma
// funcionalidade existir) não as têm: faltam no editor ao abrir e no EPUB ao exportar. Uma tabela
// única — regra nova = uma entrada — aplicada nos dois sítios.

import { customStylesSection, EDITOR_CSS_MARKER } from './custom-styles';

export type BaselineTarget = 'editor' | 'export';

export const GRID_CSS = `.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5em; margin: 1em 0; }
.grid > * { min-width: 0; }
@media (max-width: 600px) { .grid { grid-template-columns: 1fr !important; } }`;

interface BaselineRule {
    guard: string;            // se o CSS já contém isto, a regra existe (livro atual ou já corrigido)
    css: string;
    targets: BaselineTarget[];
}

// Ordem = ordem de saída. `editor` é um subconjunto: o resto o editor já traz (contentStyles) ou não precisa.
const RULES: BaselineRule[] = [
    { guard: '.small-caps', css: '.small-caps { font-variant: small-caps; }', targets: ['export'] },
    { guard: '.p-italic', targets: ['editor', 'export'], css: `.p-bold { font-weight: bold !important; }
.p-italic { font-style: italic !important; }
.p-bold-italic { font-weight: bold !important; font-style: italic !important; }` },
    { guard: '.p-uppercase', css: '.p-uppercase { text-transform: uppercase !important; }', targets: ['editor', 'export'] },
    { guard: '.p-asterisk', css: '.p-asterisk { text-align: center !important; text-indent: 0 !important; font-style: italic; font-size: 1.3em; margin: 1.5em 0 !important; }', targets: ['export'] },
    { guard: '.img-inline', css: 'img.img-inline { display: inline-block; float: none; max-width: none; height: 1.2em; width: auto; margin: 0 0.2em; vertical-align: middle; }', targets: ['editor', 'export'] },
    { guard: '.grid', css: GRID_CSS, targets: ['editor', 'export'] },
    // Livros antigos sem regra de `hr`: o default do e-reader é ~100% de largura e a divisória "Pequena"
    // (sem classe) exportava como larga.
    { guard: '.divider-full', css: 'hr { border: none; height: 1px; background: #ccc; width: 40%; margin: 1.5em auto; }\nhr.divider-full { width: 100%; }', targets: ['export'] },
];

const PARAGRAPH_MARKER = '/* === ESTILOS DE PARÁGRAFO === */';
const indent = (css: string) => css.replace(/^/gm, '    ');

// No editor entram junto dos estilos de parágrafo (se o marcador existir); no export vão para o fim.
function add(css: string, rule: string, target: BaselineTarget): string {
    if (target === 'export') return `${css}\n${rule}`;
    const idx = css.indexOf(PARAGRAPH_MARKER);
    if (idx === -1) return `${css.trimEnd()}\n\n${indent(rule)}\n`;
    const lineEnd = css.indexOf('\n', idx);
    const at = lineEnd === -1 ? css.length : lineEnd + 1;
    return `${css.slice(0, at)}${indent(rule)}\n\n${css.slice(at)}`;
}

export function ensureBaselineCss(css: string, target: BaselineTarget): string {
    let out = css;
    for (const r of RULES) if (r.targets.includes(target) && !out.includes(r.guard)) out = add(out, r.css, target);
    return out;
}

// O style.css por livro tem uma secção editor-only após este marcador; cortar antes de exportar/pré-visualizar.
export const stripEditorOnlyCss = (css: string): string => {
    const i = css.indexOf(EDITOR_CSS_MARKER);
    if (i === -1) return css;
    const kept = css.slice(0, i).trimEnd();
    // Estilos personalizados criados no editor vão para o fim do style.css (depois do marcador): mantêm-se.
    const custom = customStylesSection(css);
    return custom && !kept.includes(custom) ? `${kept}\n\n${custom}` : kept;
};
