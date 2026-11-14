// Estilos novos propostos pela IA (de parágrafo ou de caracteres c-nome): valida o pedido ({ name, props, kind? }) e devolve o que se vai criar ({ cls, body }).
// Só uma lista fechada de propriedades e valores simples — nada de url(), @import, funções ou posicionamento.
import { createCustomStyle, applyBookRule, customStyleClasses, deleteCustomStyle } from './book-css';
import { readRuleBody } from './css-rule';
import { paragraphStyles, charStyles } from './user-styles';
import { EDITOR_CLASSES, STRUCTURAL_CLASSES } from './editor-classes';

/** Classes que uma regra da IA pode acrescentar: as do editor (menos as estruturais), os estilos do utilizador e `extra` (estilos a criar). */
export const classesForRules = (css: string, extra: string[] = []): Set<string> =>
    new Set([...[...EDITOR_CLASSES].filter((c) => !STRUCTURAL_CLASSES.includes(c)), ...customStyleClasses(css), ...extra]);

/** `kind` 'char' = estilo de caracteres (`.c-nome`, aplica-se a <span class>); por omissão, de parágrafo. */
export interface NewStyle { name: string; props: Record<string, string>; kind?: 'paragraph' | 'char' }
export interface PlannedStyle { cls: string; body: string }

export const STYLE_PROPS = [
    'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height', 'letter-spacing',
    'text-align', 'text-indent', 'text-transform', 'color', 'background-color', 'background', 'border-radius',
    'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'border-top', 'border-bottom', 'border-left', 'border-right',
];
const VALUE_RE = /^[\w\s.,%#+-]{1,40}$/; // sem ; { } ( ) " ' : /

export function planStyles(styles: NewStyle[], css: string): { planned: PlannedStyle[]; errors: string[] } {
    const planned: PlannedStyle[] = [];
    const errors: string[] = [];
    let current = css;
    styles.forEach((s, i) => {
        const at = `estilo ${i + 1}`;
        const cls = (s?.kind === 'char' ? charStyles : paragraphStyles).classOf(String(s?.name ?? ''));
        const entries = Object.entries(s?.props ?? {});
        if (!cls) return errors.push(`${at}: nome inválido`);
        if (EDITOR_CLASSES.has(cls)) return errors.push(`${at}: ".${cls}" já é uma classe do editor`);
        if (!entries.length) return errors.push(`${at}: sem propriedades`);
        for (const [k, v] of entries) {
            if (!STYLE_PROPS.includes(k)) return errors.push(`${at}: propriedade não permitida "${k}" (permitidas: ${STYLE_PROPS.join(', ')})`);
            if (typeof v !== 'string' || !VALUE_RE.test(v)) return errors.push(`${at}: valor inválido em "${k}"`);
        }
        const body = entries.map(([k, v]) => `${k}: ${v.trim()};`).join(' ');
        const res = createCustomStyle(current, cls, body); // também apanha "já existe"
        if ('error' in res) return errors.push(`${at}: ${res.error}`);
        current = res.css;
        planned.push({ cls, body });
    });
    return { planned, errors };
}

/** `cls`: classe sem ponto, ou um título (h1, h2, h3). */
export interface StyleEdit { cls: string; props: Record<string, string> }
export const HEADING_SELECTORS = ['h1', 'h2', 'h3'];
/** Seletor da regra: o título tal como está, a classe com ponto. */
export const selectorOf = (cls: string): string => (HEADING_SELECTORS.includes(cls) ? cls : `.${cls}`);
/** Alteração a um estilo que já existe: `decls` com valor null removem a declaração; `before`/`after` são o corpo da regra, para mostrar. */
export interface PlannedEdit { cls: string; selector: string; decls: [string, string | null][]; before: string; after: string }

/** Edições a estilos EXISTENTES (do editor, do utilizador ou os títulos h1–h3). Valor '' remove a propriedade. Edições que não mudam nada ficam de fora. */
export function planStyleEdits(edits: StyleEdit[], css: string): { planned: PlannedEdit[]; errors: string[] } {
    const planned: PlannedEdit[] = [];
    const errors: string[] = [];
    const allowed = new Set([...classesForRules(css), ...HEADING_SELECTORS]);
    let current = css;
    edits.forEach((e, i) => {
        const at = `edição ${i + 1}`;
        const entries = Object.entries(e?.props ?? {});
        if (!allowed.has(String(e?.cls))) return errors.push(`${at}: o estilo "${e?.cls}" não existe (ou não se pode editar)`);
        if (!entries.length) return errors.push(`${at}: sem propriedades`);
        for (const [k, v] of entries) {
            if (!STYLE_PROPS.includes(k)) return errors.push(`${at}: propriedade não permitida "${k}" (permitidas: ${STYLE_PROPS.join(', ')})`);
            if (typeof v !== 'string' || (v !== '' && !VALUE_RE.test(v))) return errors.push(`${at}: valor inválido em "${k}"`);
        }
        const decls = entries.map(([k, v]): [string, string | null] => [k, v.trim() === '' ? null : v.trim()]);
        const sel = selectorOf(e.cls);
        const next = applyBookRule(current, sel, decls);
        const before = readRuleBody(current, sel), after = readRuleBody(next, sel);
        current = next;
        if (before !== after) planned.push({ cls: e.cls, selector: sel, decls, before, after });
    });
    return { planned, errors };
}

/** Quantas vezes cada classe aparece nos atributos class do HTML (blocos e spans). */
export function classUsage(html: string): Map<string, number> {
    const uses = new Map<string, number>();
    for (const m of html.matchAll(/\bclass="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) uses.set(c, (uses.get(c) ?? 0) + 1);
    return uses;
}

/**
 * Estilos do UTILIZADOR a apagar: só os que existem e que nenhum bloco nem span usa (`html` = o livro depois das regras do mesmo
 * plano, por isso "tira a classe X e apaga o estilo X" cabe num só pedido). Um estilo em uso é erro: apagá-lo deixava classes soltas.
 */
export function planStyleRemovals(classes: string[], css: string, html: string): { planned: string[]; errors: string[] } {
    const custom = new Set(customStyleClasses(css));
    const uses = classUsage(html);
    const errors: string[] = [];
    const planned: string[] = [];
    for (const cls of new Set(classes)) {
        if (typeof cls !== 'string' || !custom.has(cls)) errors.push(`"${String(cls)}" não é um estilo do utilizador`);
        else if (uses.get(cls)) errors.push(`o estilo "${cls}" está em uso (${uses.get(cls)} ${uses.get(cls) === 1 ? 'vez' : 'vezes'}): não se apaga`);
        else planned.push(cls);
    }
    return { planned, errors };
}

/**
 * Aplica ao CSS do livro os estilos novos, as edições e os estilos a apagar já validados (numa só passagem: o CSS em estado só muda no render
 * seguinte). Revalida contra o CSS ATUAL: entre a simulação e o Aplicar o livro pode ter mudado (estilo criado entretanto,
 * estilo apagado). Com erros devolve o CSS inalterado.
 */
export function applyStylePlan(css: string, styles: PlannedStyle[], edits: PlannedEdit[], removals: string[] = []): { css: string; errors: string[] } {
    const errors: string[] = [];
    const allowed = new Set([...classesForRules(css), ...HEADING_SELECTORS]);
    let out = css;
    for (const s of styles) {
        const r = createCustomStyle(out, s.cls, s.body);
        if ('error' in r) errors.push(r.error); else out = r.css;
    }
    for (const e of edits) {
        if (!allowed.has(e.cls)) { errors.push(`o estilo "${e.cls}" já não existe`); continue; }
        out = applyBookRule(out, e.selector, e.decls);
    }
    for (const cls of removals) out = deleteCustomStyle(out, cls);
    return errors.length ? { css, errors } : { css: out, errors };
}
