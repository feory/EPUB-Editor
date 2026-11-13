// Motor de regras sobre o livro inteiro: `select` (que blocos) + `action` (o que fazer), aplicado às `parts[]` do split de
// capítulos (1:1 com `chapters[]`). Puro: sem TinyMCE, sem rede. É o que a IA vai preencher — o modelo emite regras, nunca HTML.
// Idempotente (2.ª corrida não muda nada) e sem reserializar partes que não mudam. Os marcadores `chapter-break*` /
// `chapter-anchor` nunca são tocados.

import { exclusiveOf } from './editor-classes';

export type RuleAction =
    | { type: 'addClass'; value: string }
    | { type: 'removeClass'; value: string }
    | { type: 'removeStyle'; props: string[] }
    | { type: 'retag'; to: string }
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
    /** Índices de capítulo (nas `parts[]`) a incluir / excluir. */
    chapters?: number[];
    exceptChapters?: number[];
    /** Por omissão só filhos diretos do corpo; `true` entra em caixas, listas, células… */
    deep?: boolean;
    /**
     * Só os blocos selecionados: os filhos `index`, `index+1`… do corpo da parte `chapter`, cada um com o texto que começa pelo
     * `texts[i]` correspondente (ver `blockKey`). Quem o põe é o editor (blocos selecionados), nunca o modelo; se o livro mudou e
     * algum texto já não bate, a regra não apanha nada.
     */
    block?: { chapter: number; index: number; texts: string[] };
}

/** O início do texto de um bloco, normalizado: identifica-o (junto com a posição) sem guardar o bloco todo. */
export const blockKey = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Todas as ações e chaves do `select`, como valores: `Record` obriga o compilador a avisar se se acrescenta uma e esta lista fica para trás.
 *  Existem para o teste de contrato com o prompt do servidor (server/ai-contract.test.js). */
export const RULE_ACTION_TYPES = Object.keys({ addClass: 1, removeClass: 1, removeStyle: 1, retag: 1, delete: 1 } satisfies Record<RuleAction['type'], 1>);
export const RULE_SELECT_KEYS = Object.keys({ tag: 1, hasClass: 1, noClass: 1, hasStyle: 1, startsWith: 1, afterHeading: 1, chapters: 1, exceptChapters: 1, deep: 1, block: 1 } satisfies Record<keyof RuleSelect, 1>);

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

const isMarker = (el: Element) => /\bchapter-(break|anchor)/.test(el.className);
const isFiller = (el: Element) =>
    isMarker(el) || el.tagName === 'HR' || (!(el.textContent || '').trim() && !el.querySelector('img,table,svg'));

export function validateRules(rules: BookRule[], knownClasses?: ReadonlySet<string>): string[] {
    const errors: string[] = [];
    rules.forEach((rule, i) => {
        const at = `regra ${i + 1}`;
        const { select: s, action: a } = rule;
        if (!s.tag?.length || !s.tag.every((t) => TAG_RE.test(t))) errors.push(`${at}: "tag" obrigatória (ex. ["p"])`);
        if (s.block && !(Number.isInteger(s.block.chapter) && s.block.chapter >= 0 && Number.isInteger(s.block.index) && s.block.index >= 0 && Array.isArray(s.block.texts) && s.block.texts.length > 0 && s.block.texts.length <= MAX_BLOCKS && s.block.texts.every((t) => typeof t === 'string'))) errors.push(`${at}: "block" inválido`);
        if (s.deep && s.afterHeading) errors.push(`${at}: "afterHeading" só vale ao nível do corpo (sem "deep")`);
        if ((a.type === 'retag' || a.type === 'delete') && s.tag?.some((t) => STRUCTURAL.includes(t))) errors.push(`${at}: não se mexe em h1/h2 (capítulos)`);
        if (a.type === 'removeStyle' && (!Array.isArray(a.props) || !a.props.length || !a.props.every((p) => PROP_RE.test(p)))) errors.push(`${at}: "props" tem de ser uma lista de propriedades CSS (ex. ["margin-left"])`);
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

/** Elementos da regra, apanhados ANTES de alterar nada (retag/delete mudam os irmãos). */
function select(doc: Document, s: RuleSelect): Element[] {
    if (s.block) {
        const els = s.block.texts.map((_, i) => doc.body.children[s.block!.index + i]);
        if (els.some((el, i) => !el || blockKey(el.textContent) !== s.block!.texts[i])) return [];
        return select(doc, { ...s, block: undefined, deep: false }).filter((x) => els.includes(x));
    }
    const els = s.deep ? Array.from(doc.body.querySelectorAll(s.tag.join(','))) : Array.from(doc.body.children).filter((e) => s.tag.includes(e.tagName.toLowerCase()));
    return els.filter((el) => {
        if (isMarker(el)) return false;
        if (s.hasClass && !s.hasClass.every((c) => el.classList.contains(c))) return false;
        if (s.noClass && s.noClass.some((c) => el.classList.contains(c))) return false;
        if (s.hasStyle && !s.hasStyle.every((p) => styleDecls(el).some((d) => d.name === p))) return false;
        if (s.startsWith !== undefined && !blockKey(el.textContent).toLowerCase().startsWith(blockKey(s.startsWith).toLowerCase())) return false;
        if (s.afterHeading) {
            let prev = el.previousElementSibling;
            while (prev && isFiller(prev)) prev = prev.previousElementSibling;
            if (!prev || !(s.afterHeading as string[]).includes(prev.tagName.toLowerCase())) return false;
        }
        return true;
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
        case 'retag': {
            if (el.tagName.toLowerCase() === a.to) return undefined;
            const next = doc.createElement(a.to);
            for (const attr of Array.from(el.attributes)) next.setAttribute(attr.name, attr.value);
            while (el.firstChild) next.append(el.firstChild);
            el.replaceWith(next);
            if (a.to === 'h2') { // um h2 é fronteira de capítulo: leva o marcador (a linha tracejada no editor), como quando se faz h2 no editor
                const marker = doc.createElement('p');
                marker.className = 'chapter-break-h2';
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
            for (const el of select(doc, rule.select)) {
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
