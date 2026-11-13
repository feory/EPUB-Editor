// Tipografia do livro inteiro (português): aspas retas/curvas → «…», travessão de diálogo, reticências e espaços. Só mexe em
// TEXTO (nunca em tags nem atributos) e só reescreve as partes que mudam. Puro (DOM do parser), sem rede.

export const TYPOGRAPHY_FIXES = ['quotes', 'dashes', 'ellipsis', 'spaces'] as const;
export type TypographyFix = typeof TYPOGRAPHY_FIXES[number];

export interface TypographyResult {
    parts: string[];
    /** Alterações por tipo (só os que mudaram alguma coisa). */
    counts: Partial<Record<TypographyFix, number>>;
    /** Blocos com aspas desemparelhadas (nº ímpar): ficam como estavam. */
    skippedQuotes: number;
    /** Um exemplo antes/depois, para mostrar ao utilizador. */
    sample: { before: string; after: string } | null;
}

const BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption,dt,dd,div';
const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE']);
const NBSP = ' ';
const isMarker = (el: Element) => /\bchapter-(break|anchor)/.test(el.className);

function textNodes(root: Node, out: Text[] = []): Text[] {
    for (const child of Array.from(root.childNodes)) {
        if (child.nodeType === 3) out.push(child as Text);
        else if (child.nodeType === 1 && !SKIP.has((child as Element).tagName)) textNodes(child, out);
    }
    return out;
}

/** Troca e conta (só conta o que mudou de facto). */
function sub(text: string, re: RegExp, to: (m: RegExpMatchArray) => string): [string, number] {
    let n = 0;
    const out = text.replace(re, (...args) => {
        const m = args.slice(0, -2) as unknown as RegExpMatchArray;
        const r = to(m);
        if (r !== m[0]) n++;
        return r;
    });
    return [out, n];
}

/** As aspas de um bloco, nós de texto por ordem: retas alternam abrir/fechar; curvas já dizem o sentido. Null se ficar aberta (ambíguo). */
function fixQuotes(nodes: string[]): { texts: string[]; changed: number } | null {
    let open = false;
    let changed = 0;
    const texts = nodes.map((t) => t.replace(/["“”«»]/g, (q) => {
        let r: string;
        if (q === '“' || q === '«') { open = true; r = '«'; } else if (q === '”' || q === '»') { open = false; r = '»'; } else { open = !open; r = open ? '«' : '»'; }
        if (r !== q) changed++;
        return r;
    }));
    return open ? null : { texts: texts.map((t) => t.replace(new RegExp(`«[ ${NBSP}]+`, 'g'), '«').replace(new RegExp(`[ ${NBSP}]+»`, 'g'), '»')), changed };
}

function dashes(t: string, atBlockStart: boolean): [string, number] {
    const [a, n1] = sub(t, / [-–] /g, () => ' – ');
    const [b, n2] = atBlockStart ? sub(a, new RegExp(`^([ ${NBSP}]*)[-–—][ ${NBSP}]*(?=\\S)`), (m) => `${m[1]}— `) : [a, 0];
    return [b, n1 + n2];
}
const ellipsis = (t: string) => sub(t, /\.{3,}|…{2,}/g, () => '…');
function spaces(t: string): [string, number] {
    // Qualquer sequência de 2+ espaços (normais, duros ou tabulações, também misturados) vira um espaço; um espaço duro SÓ fica.
    const [a, n1] = sub(t, new RegExp(`[ ${NBSP}\\t]{2,}`, 'g'), () => ' ');
    const [b, n2] = sub(a, /([\p{L}\p{N}»)\]…]) +(?=[,.;:!…]|\?(?!\?))/gu, (m) => m[1]);
    return [b, n1 + n2];
}

/** Um trecho antes/depois À VOLTA da primeira diferença (com as pontas cortadas), para o exemplo mostrar o que mudou e não o início do bloco. */
function around(before: string, after: string): { before: string; after: string } {
    let i = 0;
    while (i < before.length && before[i] === after[i]) i++;
    const from = Math.max(0, i - 30);
    const cut = (t: string) => `${from > 0 ? '… ' : ''}${t.slice(from, i + 40)}${t.length > i + 40 ? ' …' : ''}`;
    return { before: cut(before), after: cut(after) };
}

export function fixTypography(parts: string[], fixes: readonly TypographyFix[] = TYPOGRAPHY_FIXES): TypographyResult {
    const want = new Set(fixes);
    const counts: TypographyResult['counts'] = {};
    let skippedQuotes = 0;
    let sample: TypographyResult['sample'] = null;
    const add = (k: TypographyFix, n: number) => { if (n) counts[k] = (counts[k] ?? 0) + n; };

    const out = parts.map((part) => {
        const doc = new DOMParser().parseFromString(part, 'text/html');
        // Os blocos folha (sem outros blocos dentro); cada texto pertence ao bloco mais próximo.
        const blocks = Array.from(doc.body.querySelectorAll(BLOCK)).filter((b) => !isMarker(b) && !b.querySelector(BLOCK));
        let dirty = false;
        for (const block of blocks) {
            const nodes = textNodes(block);
            if (!nodes.length) continue;
            const original = nodes.map((n) => n.data);
            let texts = [...original];
            if (want.has('quotes')) {
                const q = fixQuotes(texts);
                if (q) { add('quotes', q.changed); texts = q.texts; } else if (texts.some((t) => /["“”]/.test(t))) skippedQuotes++;
            }
            if (want.has('ellipsis')) texts = texts.map((t) => { const [n, c] = ellipsis(t); add('ellipsis', c); return n; });
            if (want.has('dashes')) texts = texts.map((t, i) => { const [n, c] = dashes(t, i === 0); add('dashes', c); return n; });
            if (want.has('spaces')) {
                texts = texts.map((t) => { const [n, c] = spaces(t); add('spaces', c); return n; });
                // o espaço no fim de um trecho e outro no início do seguinte (à volta de um itálico) são dois espaços seguidos
                for (let i = 1; i < texts.length; i++) {
                    if (/[ \u00a0]$/.test(texts[i - 1]) && /^[ \u00a0]/.test(texts[i])) { texts[i] = texts[i].replace(/^[ \u00a0]+/, ''); add('spaces', 1); }
                }
            }
            if (texts.some((t, i) => t !== original[i])) {
                if (!sample) sample = around(original.join(''), texts.join(''));
                nodes.forEach((n, i) => { if (n.data !== texts[i]) n.data = texts[i]; });
                dirty = true;
            }
        }
        return dirty ? doc.body.innerHTML : part;
    });
    return { parts: out, counts, skippedQuotes, sample };
}
