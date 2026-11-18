// Motor de regras sobre o livro inteiro: `select` (que blocos) + `action` (o que fazer), aplicado às `parts[]` do split de
// capítulos (1:1 com `chapters[]`). Puro: sem TinyMCE, sem rede. É o que a IA vai preencher — o modelo emite regras, nunca HTML.
// Idempotente (2.ª corrida não muda nada) e sem reserializar partes que não mudam. Os marcadores `chapter-break*` /
// `chapter-anchor` nunca são tocados.

import { exclusiveOf } from './editor-classes';
import { RULE_ACTION_TYPES as RULE_ACTIONS, RULE_SELECT_KEYS as RULE_SELECTS } from '../../shared/ai-contract.js';
import { isStructureBlock, isFillerBlock, chapterBreakClass } from './chapter-filler';

export type RuleAction =
    | { type: 'addClass'; value: string }
    | { type: 'removeClass'; value: string }
    | { type: 'removeStyle'; props: string[] }
    | { type: 'wrap'; tag: string; text?: string } // o inverso de unwrap: põe o conteúdo do bloco (ou só as ocorrências de `text`, dentro de um mesmo nó de texto) em <strong>/<em>…
    | { type: 'keepTogether'; withNext?: boolean } // sem quebra de página entre os blocos: corridas de blocos selecionados seguidos (≥2) ou, com `withNext`, cada bloco + o seguinte, num <div class="noBreak">
    | { type: 'retag'; to: string }
    | { type: 'unwrap'; tags: string[] } // tira estas etiquetas de formatação de dentro do bloco, ficando o texto (ex. <strong> → negrito removido)
    | { type: 'delete' };

export interface RuleSelect {
    /** Obrigatório: tags a apanhar (minúsculas). */
    tag: string[];
    /** Tem TODAS estas classes. */
    hasClass?: string[];
    /** Não tem NENHUMA destas classes. */
    noClass?: string[];
    /** O texto do bloco começa por isto (sem contar espaços repetidos nem maiúsculas): aponta para um título ou parágrafo concreto. */
    startsWith?: string;
    /** Tem, no atributo style (inline), TODAS estas propriedades (ex. ["margin-left"]). */
    hasStyle?: string[];
    /** O bloco de conteúdo imediatamente anterior é um destes títulos (salta marcadores, âncoras, `hr` e vazios). */
    afterHeading?: ('h1' | 'h2' | 'h3')[];
    /** O bloco de conteúdo imediatamente anterior tem TODAS estas classes (ex. ["p-top","p-bottom","p-bold"]); salta como o `afterHeading`. */
    afterClass?: string[];
    /** O bloco de conteúdo imediatamente SEGUINTE tem TODAS estas classes (o inverso de `afterClass`; o mesmo salto de marcadores, âncoras, `hr` e vazios). */
    beforeClass?: string[];
    /**
     * Com `afterClass` ou `afterHeading`: não só o bloco imediatamente a seguir, mas TODOS os seguintes. A zona acaba no próximo bloco
     * com essas classes (`afterClass`), no próximo título h1–h3 ou no fim do capítulo; com `afterHeading` conta o título mais próximo.
     */
    following?: boolean;
    /** Índices de capítulo (nas `parts[]`) a incluir / excluir. */
    chapters?: number[];
    exceptChapters?: number[];
    /** Por omissão só filhos diretos do corpo; `true` entra em caixas, listas, células… */
    deep?: boolean;
    /** Só o primeiro / último irmão (ex. `deep` + tag li: o primeiro item de CADA lista). */
    position?: 'first' | 'last';
    /**
     * Só os blocos selecionados: os filhos `index`, `index+1`… do corpo da parte `chapter`, cada um com o texto que começa pelo
     * `texts[i]` correspondente (ver `blockKey`). Quem o põe é o editor (blocos selecionados), nunca o modelo; se o livro mudou e
     * algum texto já não bate, a regra não apanha nada.
     */
    block?: { chapter: number; index: number; texts: string[]; item?: number };
    // `item`: o bloco é o `item`-ésimo <li> (ordem do documento) da lista de topo `index`; `texts` tem então só o texto desse <li>.
}

/** O início do texto de um bloco, normalizado: identifica-o (junto com a posição) sem guardar o bloco todo. */
export const blockKey = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Todas as ações e chaves do `select`. A lista vive em shared/ai-contract.js (o servidor injeta-a no prompt); estas verificações fazem o
 *  compilador avisar se se acrescenta uma ação/chave ao tipo e a lista partilhada fica para trás (ou ao contrário). */
void (RULE_ACTIONS satisfies readonly RuleAction['type'][]);
void (RULE_SELECTS satisfies readonly (keyof RuleSelect)[]);
void ({} satisfies Record<Exclude<RuleAction['type'], (typeof RULE_ACTIONS)[number]>, never>);
void ({} satisfies Record<Exclude<keyof RuleSelect, (typeof RULE_SELECTS)[number]>, never>);
export const RULE_ACTION_TYPES: readonly string[] = RULE_ACTIONS;
export const RULE_SELECT_KEYS: readonly string[] = RULE_SELECTS;

export interface BookRule {
    select: RuleSelect;
    action: RuleAction;
}

export interface RuleReport {
    /** Blocos que MUDARAM (já com a classe / sem o bloco → não contam). */
    changed: number;
    chapters: number[];
    samples: { chapter: number; before: string; after: string }[];
}

export interface RunResult {
    parts: string[];
    reports: RuleReport[];
    errors: string[];
}

const CLASS_RE = /^[a-z][a-z0-9-]*$/;
const TAG_RE = /^[a-z][a-z0-9]*$/;
const RETAG_TARGETS = ['p', 'h2', 'h3', 'h4', 'h5', 'h6'];
// shortcut: retag/delete de h1/h2 recusados — mexem nos capítulos (marcadores, sidebar 1:1), upgrade quando houver regra para isso.
const UNWRAP_TAGS = ['strong', 'b', 'em', 'i', 'u'];
const STRUCTURAL = ['h1', 'h2'];
const MAX_SAMPLES = 3;
/** Quantos blocos seguidos se podem selecionar de uma vez. */
export const MAX_BLOCKS = 100;
const SAMPLE_LEN = 160;

const PROP_RE = /^[a-z][a-z-]*$/;
/** Declarações do atributo style, sem o que não tem `:`. */
const styleDecls = (el: Element): { name: string; text: string }[] =>
    (el.getAttribute('style') || '').split(';').map((d) => d.trim()).filter((d) => d.includes(':'))
        .map((d) => ({ name: d.slice(0, d.indexOf(':')).trim().toLowerCase(), text: d }));


export function validateRules(rules: BookRule[], knownClasses?: ReadonlySet<string>): string[] {
    const errors: string[] = [];
    rules.forEach((rule, i) => {
        const at = `regra ${i + 1}`;
        const { select: s, action: a } = rule;
        if (!s.tag?.length || !s.tag.every((t) => TAG_RE.test(t))) errors.push(`${at}: "tag" obrigatória (ex. ["p"])`);
        if (s.block && !(Number.isInteger(s.block.chapter) && s.block.chapter >= 0 && Number.isInteger(s.block.index) && s.block.index >= 0 && (s.block.item === undefined || (Number.isInteger(s.block.item) && s.block.item >= 0)) && Array.isArray(s.block.texts) && s.block.texts.length > 0 && s.block.texts.length <= MAX_BLOCKS && s.block.texts.every((t) => typeof t === 'string'))) errors.push(`${at}: "block" inválido`);
        if (s.deep && (s.afterHeading || s.afterClass || s.beforeClass)) errors.push(`${at}: "afterHeading"/"afterClass"/"beforeClass" só valem ao nível do corpo (sem "deep")`);
        if (s.position && s.position !== 'first' && s.position !== 'last') errors.push(`${at}: "position" tem de ser "first" ou "last"`);
        if (s.following && !s.afterClass && !s.afterHeading) errors.push(`${at}: "following" só vale com "afterClass" ou "afterHeading"`);
        for (const key of ['afterClass', 'beforeClass'] as const) {
            const list = s[key];
            if (list && (!Array.isArray(list) || !list.length || !list.every((c) => CLASS_RE.test(c)))) errors.push(`${at}: "${key}" tem de ser uma lista de classes`);
        }
        if ((a.type === 'retag' || a.type === 'delete') && s.tag?.some((t) => STRUCTURAL.includes(t))) errors.push(`${at}: não se mexe em h1/h2 (capítulos)`);
        if (a.type === 'removeStyle' && (!Array.isArray(a.props) || !a.props.length || !a.props.every((p) => PROP_RE.test(p)))) errors.push(`${at}: "props" tem de ser uma lista de propriedades CSS (ex. ["margin-left"])`);
        if (a.type === 'unwrap' && (!Array.isArray(a.tags) || !a.tags.length || !a.tags.every((t) => UNWRAP_TAGS.includes(t)))) errors.push(`${at}: "tags" tem de ser uma lista de ${UNWRAP_TAGS.join('/')}`);
        if (a.type === 'keepTogether' && a.withNext !== undefined && typeof a.withNext !== 'boolean') errors.push(`${at}: "withNext" tem de ser true ou false`);
        if (a.type === 'wrap' && (!UNWRAP_TAGS.includes(a.tag) || (a.text !== undefined && (typeof a.text !== 'string' || !a.text.trim() || a.text.length > 200)))) errors.push(`${at}: "tag" tem de ser ${UNWRAP_TAGS.join('/')} e "text" (opcional) até 200 caracteres`);
        if (s.hasStyle && (!Array.isArray(s.hasStyle) || !s.hasStyle.every((p) => PROP_RE.test(p)))) errors.push(`${at}: "hasStyle" inválido`);
        if (a.type === 'retag' && !RETAG_TARGETS.includes(a.to)) errors.push(`${at}: retag só para ${RETAG_TARGETS.join('/')}`);
        // h2 sem marcador de capítulo é só um título (ex. corrigir h1 → h3): só a partir de outros títulos, nunca de parágrafos.
        if (a.type === 'retag' && a.to === 'h2' && s.tag?.some((t) => !/^h[3-6]$/.test(t))) errors.push(`${at}: retag para h2 só a partir de h3–h6`);
        if (s.startsWith !== undefined && (typeof s.startsWith !== 'string' || blockKey(s.startsWith).length < 2 || s.startsWith.length > 120)) errors.push(`${at}: "startsWith" tem de ter 2–120 caracteres`);
        if (a.type === 'addClass' || a.type === 'removeClass') {
            if (!CLASS_RE.test(a.value) || a.value.startsWith('chapter-')) errors.push(`${at}: classe inválida "${a.value}"`);
            else if (a.type === 'addClass' && knownClasses && !knownClasses.has(a.value)) errors.push(`${at}: classe desconhecida "${a.value}"`);
        }
    });
    return errors;
}

/** O bloco de conteúdo imediatamente anterior (salta marcadores, âncoras, hr e vazios). */
const prevContent = (el: Element): Element | null => {
    let prev = el.previousElementSibling;
    while (prev && isFillerBlock(prev)) prev = prev.previousElementSibling;
    return prev;
};
const afterHeadingOk = (el: Element, headings: string[]): boolean => {
    const prev = prevContent(el);
    return !!prev && headings.includes(prev.tagName.toLowerCase());
};
/** O bloco de conteúdo imediatamente seguinte (salta marcadores, âncoras, hr e vazios). */
const nextContent = (el: Element): Element | null => {
    let next = el.nextElementSibling;
    while (next && isFillerBlock(next)) next = next.nextElementSibling;
    return next;
};
const hasAll = (el: Element | null, classes: string[]): boolean => !!el && classes.every((c) => el.classList.contains(c));
/** `el` vem depois de um título destes, sem outro título h1–h3 pelo meio (o mais próximo decide). */
const inRunAfterHeading = (el: Element, headings: string[]): boolean => {
    for (let prev = el.previousElementSibling; prev; prev = prev.previousElementSibling) {
        if (isStructureBlock(prev)) continue;
        const tag = prev.tagName.toLowerCase();
        if (/^h[1-3]$/.test(tag)) return headings.includes(tag);
    }
    return false;
};
/** `el` vem depois de um bloco com TODAS as `classes`, sem outro bloco assim nem título h1–h3 pelo meio (o próprio `el` não conta). */
const inRunAfterClass = (el: Element, classes: string[]): boolean => {
    for (let prev = el.previousElementSibling; prev; prev = prev.previousElementSibling) {
        if (isStructureBlock(prev)) continue;
        if (classes.every((c) => prev!.classList.contains(c))) return true;
        if (/^h[1-3]$/.test(prev.tagName.toLowerCase())) return false;
    }
    return false;
};

/** Elementos da regra, apanhados ANTES de alterar nada (retag/delete mudam os irmãos). */
function select(doc: Document, s: RuleSelect): Element[] {
    if (s.block?.item !== undefined) {
        const li = doc.body.children[s.block.index]?.querySelectorAll('li')[s.block.item];
        if (!li || blockKey(li.textContent) !== s.block.texts[0]) return [];
        return select(doc, { ...s, block: undefined, deep: true }).filter((x) => x === li);
    }
    if (s.block) {
        const els = s.block.texts.map((_, i) => doc.body.children[s.block!.index + i]);
        if (els.some((el, i) => !el || blockKey(el.textContent) !== s.block!.texts[i])) return [];
        return select(doc, { ...s, block: undefined, deep: false }).filter((x) => els.includes(x));
    }
    const els = s.deep ? Array.from(doc.body.querySelectorAll(s.tag.join(','))) : Array.from(doc.body.children).filter((e) => s.tag.includes(e.tagName.toLowerCase()));
    return els.filter((el) => {
        if (isStructureBlock(el)) return false;
        if (s.position && (s.position === 'first' ? el.previousElementSibling : el.nextElementSibling)) return false;
        if (s.hasClass && !s.hasClass.every((c) => el.classList.contains(c))) return false;
        if (s.noClass && s.noClass.some((c) => el.classList.contains(c))) return false;
        if (s.hasStyle && !s.hasStyle.every((p) => styleDecls(el).some((d) => d.name === p))) return false;
        if (s.startsWith !== undefined && !blockKey(el.textContent).toLowerCase().startsWith(blockKey(s.startsWith).toLowerCase())) return false;
        if (s.afterHeading && !(s.following ? inRunAfterHeading(el, s.afterHeading) : afterHeadingOk(el, s.afterHeading))) return false;
        if (s.afterClass && !(s.following ? inRunAfterClass(el, s.afterClass) : hasAll(prevContent(el), s.afterClass))) return false;
        if (s.beforeClass && !hasAll(nextContent(el), s.beforeClass)) return false;
        return true;
    });
}

const inNoBreak = (el: Element) => !!el.closest('.noBreak');

/**
 * `keepTogether`: agrupa em `<div class="noBreak">` (a "União" do editor). Por omissão as corridas de blocos selecionados que são
 * irmãos seguidos (≥ 2); com `withNext`, cada bloco selecionado com o irmão seguinte (que não seja marcador/enchimento). Devolve os grupos criados.
 */
function keepTogether(doc: Document, els: Element[], withNext: boolean): { wrapper: Element; before: string }[] {
    const groups: Element[][] = [];
    const chosen = new Set(els);
    for (const el of els) {
        if (inNoBreak(el) || el.parentElement?.classList.contains('noBreak')) continue;
        const next = el.nextElementSibling;
        if (withNext) {
            if (next && !isFillerBlock(next) && !inNoBreak(next)) groups.push([el, next]);
        } else if (!chosen.has(el.previousElementSibling as Element)) {
            const run = [el];
            for (let n = next; n && chosen.has(n) && !inNoBreak(n); n = n.nextElementSibling) run.push(n);
            if (run.length > 1) groups.push(run);
        }
    }
    return groups.map((g) => {
        const before = g.map((e) => e.outerHTML).join('');
        const wrapper = doc.createElement('div');
        wrapper.className = 'noBreak';
        g[0].before(wrapper);
        wrapper.append(...g);
        return { wrapper, before };
    });
}

/** Aplica a ação. Devolve o elemento resultante (`null` = apagado), ou `undefined` se não havia nada a mudar. */
function apply(doc: Document, el: Element, a: RuleAction): Element | null | undefined {
    switch (a.type) {
        case 'addClass': {
            const partner = exclusiveOf(a.value);
            const hadPartner = !!partner && el.classList.contains(partner);
            if (el.classList.contains(a.value) && !hadPartner) return undefined;
            if (hadPartner) el.classList.remove(partner);
            el.classList.add(a.value);
            return el;
        }
        case 'removeClass':
            if (!el.classList.contains(a.value)) return undefined;
            el.classList.remove(a.value);
            if (!el.getAttribute('class')) el.removeAttribute('class');
            return el;
        case 'removeStyle': {
            const all = styleDecls(el);
            const kept = all.filter((d) => !a.props.includes(d.name));
            if (kept.length === all.length) return undefined;
            if (kept.length) el.setAttribute('style', `${kept.map((d) => d.text).join('; ')};`);
            else el.removeAttribute('style');
            return el;
        }
        case 'unwrap': {
            const found = Array.from(el.querySelectorAll(a.tags.join(',')));
            if (!found.length) return undefined;
            found.forEach((n) => n.replaceWith(...Array.from(n.childNodes)));
            el.normalize();
            return el;
        }
        case 'wrap': {
            const inside = (n: Node) => { for (let p = n.parentElement; p && p !== el.parentElement; p = p.parentElement) if (p.tagName.toLowerCase() === a.tag) return true; return false; };
            if (a.text === undefined) {
                if (!el.textContent?.trim() || (el.children.length === 1 && el.firstElementChild!.tagName.toLowerCase() === a.tag && el.textContent === el.firstElementChild!.textContent)) return undefined;
                const w = doc.createElement(a.tag);
                w.append(...Array.from(el.childNodes));
                el.append(w);
                return el;
            }
            const walker = doc.createTreeWalker(el, 4);
            const nodes: Text[] = [];
            for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes(a.text) && !inside(n)) nodes.push(n as Text);
            if (!nodes.length) return undefined;
            for (const t of nodes) {
                const frag = doc.createDocumentFragment();
                t.data.split(a.text).forEach((piece, i) => {
                    if (i) { const w = doc.createElement(a.tag); w.textContent = a.text!; frag.append(w); }
                    if (piece) frag.append(piece);
                });
                t.replaceWith(frag);
            }
            return el;
        }
        case 'retag': {
            if (el.tagName.toLowerCase() === a.to) return undefined;
            const next = doc.createElement(a.to);
            for (const attr of Array.from(el.attributes)) next.setAttribute(attr.name, attr.value);
            while (el.firstChild) next.append(el.firstChild);
            el.replaceWith(next);
            if (a.to === 'h2') { // um h2 é fronteira de capítulo: leva o marcador (a linha tracejada no editor), como quando se faz h2 no editor
                const marker = doc.createElement('p');
                marker.className = chapterBreakClass('h2');
                marker.setAttribute('data-title', (next.textContent || '').replace(/\s+/g, ' ').trim());
                next.before(marker);
            }
            return next;
        }
        case 'delete':
            el.remove();
            return null;
    }
}

const clip = (html: string) => (html.length > SAMPLE_LEN ? `${html.slice(0, SAMPLE_LEN)}…` : html);

/**
 * Corre as regras em sequência (a regra N vê o resultado da N-1). Simulação = ignorar `parts` do resultado e mostrar `reports`.
 * Se alguma regra é inválida devolve só `errors` e as partes intactas.
 */
export function runRules(parts: string[], rules: BookRule[], knownClasses?: ReadonlySet<string>): RunResult {
    const errors = validateRules(rules, knownClasses);
    if (errors.length) return { parts, reports: [], errors };

    const current = [...parts];
    const reports: RuleReport[] = rules.map(() => ({ changed: 0, chapters: [], samples: [] }));
    current.forEach((part, ci) => {
        const wanted = rules.filter((r) => (r.select.block ? r.select.block.chapter === ci : !r.select.chapters || r.select.chapters.includes(ci)) && !r.select.exceptChapters?.includes(ci));
        if (!wanted.length) return;
        const doc = new DOMParser().parseFromString(part, 'text/html');
        let dirty = false;
        for (const rule of wanted) {
            const report = reports[rules.indexOf(rule)];
            let hits = 0;
            if (rule.action.type === 'keepTogether') {
                for (const { wrapper, before } of keepTogether(doc, select(doc, rule.select), !!rule.action.withNext)) {
                    hits++;
                    if (report.samples.length < MAX_SAMPLES) report.samples.push({ chapter: ci, before: clip(before), after: clip(wrapper.outerHTML) });
                }
            } else for (const el of select(doc, rule.select)) {
                const before = el.outerHTML;
                const result = apply(doc, el, rule.action);
                if (result === undefined) continue;
                hits++;
                if (report.samples.length < MAX_SAMPLES) report.samples.push({ chapter: ci, before: clip(before), after: clip(result?.outerHTML ?? '') });
            }
            if (hits) {
                report.changed += hits;
                report.chapters.push(ci);
                dirty = true;
            }
        }
        if (dirty) current[ci] = doc.body.innerHTML;
    });
    return { parts: current, reports, errors: [] };
}
