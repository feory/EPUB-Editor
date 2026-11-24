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
/** Declarações da regra tal como estão escritas (`a: b; c: d;`), ou '' se não existe. */
export const readRuleBody = (css: string, selector: string): string => (ruleRe(selector).exec(css)?.[3] ?? '').trim();

/** Troca TODO o corpo da regra (mantém o resto do CSS); sem a regra devolve o CSS igual. */
export const replaceRuleBody = (css: string, selector: string, body: string): string =>
    css.replace(ruleRe(selector), (_all, pre: string, gap: string) => `${pre}${gap}${selector} { ${body} }`);

/** Troca o seletor da regra (mantém o corpo); sem a regra devolve o CSS igual. */
export const renameRule = (css: string, from: string, to: string): string =>
    css.replace(ruleRe(from), (_all, pre: string, gap: string, body: string) => `${pre}${gap}${to} {${body}}`);

/** Tira a regra (e a linha dela); sem a regra devolve o CSS igual. */
export const removeRule = (css: string, selector: string): string =>
    css.replace(ruleRe(selector), (_all, pre: string, gap: string) => `${pre}${gap.replace(/[ \t]*$/, '')}`) // o intervalo antes (comentários, ex. cabeçalho de secção) fica
        .replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n');

export const hasRule = (css: string, selector: string): boolean => ruleRe(selector).test(css);

export type Effect = 'bold' | 'italic' | 'center' | 'small' | 'indent' | 'top';
/** Para cada efeito, as classes do livro cuja regra o dá. */
export type ClassEffects = Record<Effect, Set<string>>;

const bare = (v: string) => v.replace(/\s*!important/i, '').trim();
/** O que uma regra diz de cada efeito: true/false, ou undefined se não fala dele. */
const EFFECT_OF: Record<Effect, (d: Map<string, string>) => boolean | undefined> = {
    bold: (d) => { const v = d.get('font-weight'); return v === undefined ? undefined : /^(bold|bolder)$/i.test(bare(v)) || parseInt(bare(v), 10) >= 600; },
    italic: (d) => { const v = d.get('font-style'); return v === undefined ? undefined : /^(italic|oblique)/i.test(bare(v)); },
    center: (d) => { const v = d.get('text-align'); return v === undefined ? undefined : /^center$/i.test(bare(v)); },
    // letra pequena: só valores relativos ao corpo (em/rem < 1, % < 100, smaller/small…); px/pt não se sabe comparar
    small: (d) => {
        const v = d.get('font-size');
        if (v === undefined) return undefined;
        const m = /^([\d.]+)(em|rem|%)$/i.exec(bare(v));
        return m ? parseFloat(m[1]) < (m[2] === '%' ? 100 : 1) : /^(smaller|small|x-small|xx-small)$/i.test(bare(v));
    },
    indent: (d) => { const v = d.get('text-indent'); return v === undefined ? undefined : parseFloat(bare(v)) > 0; },
    top: (d) => { const v = d.get('margin-top') ?? d.get('margin')?.split(/\s+/)[0]; return v === undefined ? undefined : parseFloat(bare(v)) > 0; },
};

/**
 * O que cada classe do livro FAZ, lido do CSS: quais dão negrito, itálico, centrado, letra pequena, recuo da 1.ª linha e espaço acima. A auditoria
 * de estilos usa-o para não depender dos NOMES (um estilo renomeado, como p-bold → p-subtitulo, continua a contar). Só regras de uma classe sozinha
 * (as de `.a .b` ou `p.a` dependem do contexto); numa classe repetida vale a última declaração de cada propriedade.
 */
export function classEffects(css: string): ClassEffects {
    const state = new Map<string, Map<Effect, boolean>>();
    for (const chunk of css.replace(/\/\*[\s\S]*?\*\//g, '').split('}')) {
        const open = chunk.indexOf('{');
        const cls = /^\.([\w-]+)$/.exec(chunk.slice(0, open < 0 ? 0 : open).trim())?.[1];
        if (!cls) continue;
        const decls = new Map(parse(chunk.slice(open + 1)));
        const effects = state.get(cls) ?? state.set(cls, new Map()).get(cls)!;
        for (const [effect, read] of Object.entries(EFFECT_OF) as [Effect, (typeof EFFECT_OF)[Effect]][]) {
            const on = read(decls);
            if (on !== undefined) effects.set(effect, on);
        }
    }
    const out: ClassEffects = { bold: new Set(), italic: new Set(), center: new Set(), small: new Set(), indent: new Set(), top: new Set() };
    for (const [cls, effects] of state) for (const [effect, on] of effects) if (on) out[effect].add(cls);
    return out;
}
