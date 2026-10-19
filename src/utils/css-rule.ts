// Leitura/escrita pontual de UMA regra `seletor { … }` no CSS do livro (modo "Estilo" do painel).
// Regex para o formato usado neste projeto, não um parser CSS: livros com CSS escrito à mão
// noutro formato mostram valores vazios mas continuam editáveis no Editor CSS.

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Regra de topo: depois do início, de `}` ou de comentários — nunca o seletor dentro de outro (`p.drop-cap`, `ul p`).
const ruleRe = (selector: string) => new RegExp(`(^|\\})((?:\\s|/\\*[\\s\\S]*?\\*/)*)${esc(selector)}\\s*\\{([^}]*)\\}`);

const parse = (body: string): [string, string][] =>
    body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
        const i = d.indexOf(':');
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    });

export function readRule(css: string, selector: string): (name: string) => string {
    const decls = new Map(parse(ruleRe(selector).exec(css)?.[3] ?? ''));
    return (name) => decls.get(name) ?? '';
}

// decls: [propriedade, valor | null]. Mantém o `!important` que a declaração já tinha.
export function applyRule(css: string, selector: string, decls: [string, string | null][]): string {
    const m = ruleRe(selector).exec(css);
    const map = new Map(parse(m?.[3] ?? ''));
    for (const [name, value] of decls) {
        if (value === null) { map.delete(name); continue; }
        map.set(name, /!important/i.test(map.get(name) ?? '') ? `${value} !important` : value);
    }
    const body = [...map].map(([n, v]) => `${n}: ${v};`).join(' ');
    if (m) return css.replace(ruleRe(selector), (_all, pre: string, gap: string) => `${pre}${gap}${selector} { ${body} }`);
    return body ? `${css.trimEnd()}\n\n    ${selector} { ${body} }\n` : css;
}
export const hasRule = (css: string, selector: string): boolean => ruleRe(selector).test(css);
