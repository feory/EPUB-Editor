// Estilos INLINE em <span style="…"> do livro: normalizar para comparar (ordem, espaços e maiúsculas não contam), listar os
// que existem e trocar um deles por uma classe (estilo de caracteres c-nome). Puro (DOM do parser), sem rede.

/** `background:#000; color: #FFF` → Map { background → #000, color → #fff } (propriedade e valor em minúsculas, espaços colapsados). */
export function parseStyle(attr: string | null | undefined): Map<string, string> {
    const out = new Map<string, string>();
    for (const decl of (attr ?? '').split(';')) {
        const i = decl.indexOf(':');
        if (i < 1) continue;
        out.set(decl.slice(0, i).trim().toLowerCase(), decl.slice(i + 1).trim().replace(/\s+/g, ' ').toLowerCase());
    }
    return out;
}

/** As duas listas de declarações dizem o mesmo (mesmas propriedades, mesmos valores, qualquer ordem). */
export function sameStyle(a: Map<string, string>, b: Map<string, string>): boolean {
    return a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
}

const toMap = (style: Record<string, string>): Map<string, string> => parseStyle(Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';'));

/**
 * Troca, em cada <span> cujo style é EXATAMENTE `style`, o atributo style pela classe `cls`. `scope`: só dentro destas tags
 * (ex. ["h1"]). Devolve as partes novas (as intactas, a mesma string) e quantos spans mudaram.
 */
export function convertSpanStyles(parts: string[], opts: { style: Record<string, string>; cls: string; scope?: string[] }): { parts: string[]; changed: number } {
    const want = toMap(opts.style);
    const scope = opts.scope?.map((t) => t.toLowerCase());
    let changed = 0;
    const out = parts.map((part) => {
        if (!part.includes('<span')) return part;
        const doc = new DOMParser().parseFromString(part, 'text/html');
        let dirty = false;
        for (const span of Array.from(doc.body.querySelectorAll('span[style]'))) {
            if (!sameStyle(parseStyle(span.getAttribute('style')), want)) continue;
            if (scope && !scope.some((tag) => span.closest(tag))) continue;
            span.removeAttribute('style');
            span.classList.add(opts.cls);
            dirty = true; changed++;
        }
        return dirty ? doc.body.innerHTML : part;
    });
    return { parts: out, changed };
}

export interface SpanStyleInfo {
    /** O style tal como está escrito (o primeiro encontrado). */
    style: string;
    count: number;
    /** Em que tipo de bloco aparece e quantas vezes (h1, p…). */
    inBlocks: Record<string, number>;
    sample: string;
}

const MAX_SPAN_STYLES = 15;

/** Os <span style> do livro agrupados por style normalizado, do mais frequente para o menos: o que o modelo vê para propor conversões. */
export function scanSpanStyles(parts: string[]): SpanStyleInfo[] {
    const byKey = new Map<string, SpanStyleInfo>();
    for (const part of parts) {
        if (!part.includes('<span')) continue;
        const doc = new DOMParser().parseFromString(part, 'text/html');
        for (const span of Array.from(doc.body.querySelectorAll('span[style]'))) {
            const map = parseStyle(span.getAttribute('style'));
            if (!map.size) continue;
            const key = [...map].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(';');
            const info = byKey.get(key) ?? { style: (span.getAttribute('style') || '').trim(), count: 0, inBlocks: {}, sample: '' };
            info.count++;
            const block = span.closest('h1,h2,h3,h4,h5,h6,p,li,td,th,blockquote')?.tagName.toLowerCase() ?? 'outro';
            info.inBlocks[block] = (info.inBlocks[block] ?? 0) + 1;
            if (!info.sample) info.sample = (span.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
            byKey.set(key, info);
        }
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count).slice(0, MAX_SPAN_STYLES);
}
