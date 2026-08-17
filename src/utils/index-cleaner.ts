// Limpeza de índices remissivos extraídos de PDF: remove números de página,
// junta linhas de continuação, de-hifeniza quebras e separa entradas coladas
// (uma por elemento). Referências "ver também" coladas ao termo seguinte são
// separadas pela quebra de linha original (quando existe) ou, em último caso,
// por heurística de dicionário (corta no termo conhecido mais longo).

// Marcador interno de fronteira de entrada (vinda de quebra de linha do original).
const SEP = '\u0001';

// Vírgula inicial + lista de páginas/intervalos (inclui "34,110" sem espaço).
const PAGELIST = /,\s*\d+(?:\s*[–—-]\s*\d+)?(?:\s*,\s*\d+(?:\s*[–—-]\s*\d+)?)*/g;

// Regex de páginas para limpeza preservando formatação (DOM): remove a lista de páginas
// de um text node (usado por cleanIndexSelection, que mantém <em>/<strong>/etc.).
export const INDEX_PAGE_LIST = new RegExp(PAGELIST.source, 'g');
// Linha só de páginas (começa por dígito/traço) → continuação da entrada anterior → descartar.
export function isPageContinuation(line: string): boolean {
    return /^[\d–—-]/.test(line.trim());
}

// Região que começa por referência cruzada → grupo 1 = resto (alvo + possível termo seguinte).
const CROSSREF = /^\s*[;.,]?\s*(?:ver\s+também|ver\s+tb|ver|see\s+also)\b\s*(.*)$/i;

// Normaliza um termo para comparação no dicionário / limpeza final.
function clean(s: string): string {
    return s.replace(/[\s,;.]+$/g, '').replace(/^[\s,;.]+/, '').trim();
}

// 1. de-hifeniza quebras ("Huma-nos"/"Huma- nos"/"Huma-\nnos" → "Humanos";
//    classe minúscula protege compostos reais "Sul-Sul"); 2. reconstrói o stream
//    com marcadores de fronteira: linha que começa por dígito = continuação de
//    páginas (junta), senão = nova entrada (marcador).
function buildStream(raw: string): string {
    const dehyphenated = raw.replace(/([a-zà-ÿ])-\s*([a-zà-ÿ])/g, '$1$2');
    const lines = dehyphenated.split('\n').map(l => l.trim()).filter(Boolean);
    let stream = '';
    lines.forEach((line, i) => {
        if (i === 0) stream = line;
        // linha começada por dígito OU traço (ex. "–265", intervalo partido) = continuação de páginas
        else if (/^[\d–—-]/.test(line)) stream += ' ' + line;
        else stream += SEP + line;
    });
    // Colapsa traços consecutivos (intervalo partido "54 – –55" → "54 –55") para o PAGELIST os consumir.
    return stream.replace(/[–—-](?:\s*[–—-])+/g, '–').replace(/[ \t]+/g, ' ');
}

// Texto entre listas de páginas, na ordem do documento + a lista de páginas que fechou cada
// região (verbatim, com a vírgula inicial; '' na região final, que não tem página a seguir).
function splitRegions(stream: string): { text: string; pages: string }[] {
    const regions: { text: string; pages: string }[] = [];
    let last = 0;
    PAGELIST.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PAGELIST.exec(stream)) !== null) {
        regions.push({ text: stream.slice(last, m.index), pages: m[0] });
        last = m.index + m[0].length;
    }
    const tail = stream.slice(last);
    if (tail.trim()) regions.push({ text: tail, pages: '' });
    return regions.filter(r => r.text.split(SEP).join('').trim().length > 0);
}

// Núcleo partilhado por cleanIndexText/linkIndexPages: reconstrói as entradas (dicionário +
// crossrefs) igual nos dois casos; só difere no que acontece à lista de páginas de cada entrada
// — `onPages` decide (descartar, ou devolver texto/markup a anexar). Chamado sempre com a
// última entrada tocada nesta região (mesmo no ramo "sem match" do crossref colado, que não
// empurra entrada nova — a página, a existir, ainda pertence à entrada anterior).
function buildEntries(raw: string, onPages: (pages: string) => string): string[] {
    const stream = buildStream(raw);
    if (!stream) return [];
    const regions = splitRegions(stream);

    // Pass 1: dicionário. Em cada região, os segmentos separados por marcador que
    // NÃO são o alvo de um crossref inicial são termos próprios.
    const dict = new Set<string>();
    for (const region of regions) {
        const cr = region.text.match(CROSSREF);
        const segs = (cr ? cr[1] : region.text).split(SEP);
        const terms = cr ? segs.slice(1) : segs; // numa região-crossref, seg[0] é o alvo
        for (const t of terms) { const c = clean(t); if (c) dict.add(c.toLowerCase()); }
    }

    // Pass 2: construir entradas.
    const entries: string[] = [];
    const appendCrossref = (target: string) => {
        const t = clean(target);
        if (t && entries.length > 0) entries[entries.length - 1] += `; ver também ${t}`;
    };
    for (const region of regions) {
        const cr = region.text.match(CROSSREF);
        if (!cr) {
            for (const seg of region.text.split(SEP)) { const c = clean(seg); if (c) entries.push(c); }
        } else {
            const rest = cr[1];
            if (rest.includes(SEP)) {
                // Fronteira dada pela quebra de linha original: alvo | termo(s) novo(s).
                const parts = rest.split(SEP);
                appendCrossref(parts[0]);
                for (const seg of parts.slice(1)) { const c = clean(seg); if (c) entries.push(c); }
            } else {
                // Glued na mesma linha: sufixo conhecido mais longo = termo novo.
                const words = clean(rest).split(/\s+/);
                let cut = -1;
                for (let k = words.length - 1; k >= 1; k--) {
                    if (dict.has(clean(words.slice(words.length - k).join(' ')).toLowerCase())) { cut = k; break; }
                }
                if (cut > 0) {
                    appendCrossref(words.slice(0, words.length - cut).join(' '));
                    entries.push(clean(words.slice(words.length - cut).join(' ')));
                } else {
                    appendCrossref(rest); // sem correspondência: fica junto à anterior (revisão manual)
                }
            }
        }
        if (region.pages && entries.length > 0) entries[entries.length - 1] += onPages(region.pages);
    }
    // Descarta resíduos sem letras (traços/números soltos de intervalos partidos).
    return entries.filter(e => /[a-zà-ÿ]/i.test(e));
}

export function cleanIndexText(raw: string): string[] {
    return buildEntries(raw, () => '');
}

// Como cleanIndexText, mas em vez de descartar a lista de páginas de cada entrada, embrulha
// cada número num <span class="idx-link" data-target="page-N"> — só vira <a href> real no
// export do EPUB (ver src/services/epub/index-links.ts), apontando para o marcador de
// page-list dessa página; sem marcador correspondente no livro, o export desembrulha para
// texto simples (nunca gera link morto). Entradas devolvidas já em HTML (termo escapado); o
// chamador só precisa de embrulhar cada uma em <p>.
export function linkIndexPages(raw: string): string[] {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return buildEntries(raw, (pages) => pages)
        .map(entry => esc(entry).replace(/\d+/g, (n) => `<span class="idx-link" data-target="page-${n}">${n}</span>`));
}
