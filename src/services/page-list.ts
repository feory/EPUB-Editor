import * as pdfjsLib from 'pdfjs-dist';

// Worker partilhado com o pdf-service (já configurado lá); reconfigurar é idempotente.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

export interface PageAnchor { page: number; anchor: string }

/**
 * Renderiza a 1ª página de um PDF para JPEG (Links/ do InDesign por vezes traz as figuras
 * em PDF vetorial). `scale` controla a resolução; fundo branco (PDFs podem ser transparentes).
 */
export async function pdfToJpeg(data: ArrayBuffer, scale = 2): Promise<Blob> {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob falhou')), 'image/jpeg', 0.92));
}

// Normaliza para casar PDF↔editor apesar de espaçamento/hifenização/pontuação diferentes:
// minúsculas, só letras (incl. acentuadas) e dígitos.
function normalize(s: string): string {
    return s.toLowerCase().replace(/[^0-9a-zà-öø-ÿ]/g, '');
}

const ANCHOR_LEN = 30;   // chars normalizados usados como âncora
const MIN_ANCHOR = 15;   // mínimo para a âncora ser fiável

// Âncoras de capítulo (extractChapterAnchors) precisam de mais chars que as de página: aberturas
// de capítulo do mesmo livro por vezes começam com a mesma fórmula ("Sun Tzu disse: 1. Na
// guerra...") — só divergem bem depois dos 30 chars usados para folios.
const CHAPTER_ANCHOR_LEN = 60;
const CHAPTER_MIN_ANCHOR = 30;

// Item só-dígitos mais próximo da margem (rodapé: menor y; cabeçalho: maior y — coords do PDF
// são bottom-up). Devolve o folio dessa página nessa zona, ou null se não houver nenhum.
function folioInZone(items: { str: string; transform: number[] }[], vpH: number, zone: 'bottom' | 'top'): number | null {
    let folio: number | null = null;
    let best = zone === 'bottom' ? Infinity : -Infinity;
    for (const it of items) {
        if (!('str' in it) || !it.str) continue;
        const y = it.transform[5];
        const t = it.str.trim();
        if (!/^\d{1,4}$/.test(t)) continue;
        const inZone = zone === 'bottom' ? y < vpH * 0.12 : y > vpH * 0.88;
        if (!inZone) continue;
        const closerToEdge = zone === 'bottom' ? y < best : y > best;
        if (closerToEdge) { folio = parseInt(t); best = y; }
    }
    return folio;
}

// Nº de pares consecutivos (entre páginas COM folio detetado nesta zona) em que o valor CRESCE —
// separa folios reais (seguem a ordem do livro) de falsos positivos dispersos (nºs de nota,
// células de tabela, entradas de índice com dot-leaders) que não têm relação com a ordem real.
function monotonicScore(folios: (number | null)[]): number {
    const vals = folios.filter((f): f is number => f !== null);
    let inc = 0;
    for (let k = 1; k < vals.length; k++) if (vals[k] > vals[k - 1]) inc++;
    return inc;
}

/**
 * Extrai, por página do PDF de impressão, o número impresso (folio) e um texto-âncora
 * (início do corpo). Cada página = cabeçalho corrente (linha de topo, saltada) + folio
 * colado ao 1º texto do corpo (ex. "41na própria…"). Páginas sem folio numérico
 * (front-matter romano, aberturas de capítulo) são saltadas.
 *
 * O folio pode estar no RODAPÉ (comum) ou fundido na linha de CABEÇALHO no topo da página
 * (alguns livros) — a zona é auto-detetada por livro (não por página) comparando quantos
 * folios de cada zona seguem a ordem real das páginas (`monotonicScore`), para não confundir
 * folio com nºs de nota/tabela/índice que também caem por vezes numa das zonas.
 */
export async function extractPdfPageAnchors(data: ArrayBuffer): Promise<PageAnchor[]> {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: { vpH: number; items: { str: string; transform: number[] }[] }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vpH = page.getViewport({ scale: 1 }).height;
        const items = (await page.getTextContent()).items as { str: string; transform: number[] }[];
        pages.push({ vpH, items });
    }
    const bottomFolios = pages.map(({ items, vpH }) => folioInZone(items, vpH, 'bottom'));
    const topFolios = pages.map(({ items, vpH }) => folioInZone(items, vpH, 'top'));
    const folios = monotonicScore(topFolios) > monotonicScore(bottomFolios) ? topFolios : bottomFolios;

    const anchors: PageAnchor[] = [];
    for (let idx = 0; idx < pages.length; idx++) {
        const folio = folios[idx];
        if (folio === null) continue; // sem folio (front-matter, abertura de capítulo) → saltar
        const lines = new Map<number, { x: number; str: string }[]>();
        for (const it of pages[idx].items) {
            if (!('str' in it) || !it.str) continue;
            const y = it.transform[5];
            (lines.get(Math.round(y)) ?? lines.set(Math.round(y), []).get(Math.round(y))!).push({ x: it.transform[4], str: it.str });
        }
        // âncora = 1ª linha de corpo APÓS o cabeçalho corrente (linha de topo); ordenar topo→baixo
        const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0])
            .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map(p => p.str).join(''));
        for (const line of ordered.slice(1)) {
            const anchor = normalize(line).slice(0, ANCHOR_LEN);
            if (anchor.length < MIN_ANCHOR) continue;
            anchors.push({ page: folio, anchor });
            break;
        }
    }
    return anchors;
}

export interface ChapterAnchor { title: string; anchor: string }

/**
 * Livros cujo corpo é uma story IDML CONTÍNUA sem CAPITULAR a marcar aberturas de capítulo
 * (única fronteira real = uma página de título dedicada, sem correspondência recuperável no
 * XML — ex. "A Arte da Guerra"): localiza cada título (já extraído do IDML) na sua página de
 * abertura do PDF de impressão e devolve o início da página SEGUINTE como âncora de onde o
 * capítulo começa no corpo corrido. Descarta páginas que contenham OUTRO título da lista
 * (índice/TOC lista todos juntos — não é a página de abertura).
 */
export async function extractChapterAnchors(data: ArrayBuffer, titles: string[]): Promise<ChapterAnchor[]> {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pageTexts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const items = (await page.getTextContent()).items as { str: string }[];
        pageTexts.push(normalize(items.map(it => it.str).join(' ')));
    }
    const normTitles = titles.map(normalize);
    const anchors: ChapterAnchor[] = [];
    for (let ti = 0; ti < titles.length; ti++) {
        const nt = normTitles[ti];
        if (nt.length < 3) continue;
        let pageIdx = -1;
        for (let p = 0; p < pageTexts.length; p++) {
            if (!pageTexts[p].includes(nt)) continue;
            const hasOther = normTitles.some((other, oi) => oi !== ti && other.length >= 3 && pageTexts[p].includes(other));
            if (hasOther) continue; // página de índice/TOC (lista vários títulos) — não é a abertura
            pageIdx = p;
            break;
        }
        if (pageIdx === -1) continue;
        // Saltar página(s) em branco a seguir à abertura (comum: capítulo começa em página
        // direita, verso fica vazio) até à 1ª página com texto real.
        let next = pageIdx + 1;
        while (next < pageTexts.length && pageTexts[next].length === 0) next++;
        if (next >= pageTexts.length) continue;
        const anchor = pageTexts[next].slice(0, CHAPTER_ANCHOR_LEN);
        if (anchor.length < CHAPTER_MIN_ANCHOR) continue;
        anchors.push({ title: titles[ti], anchor });
    }
    return anchors;
}

/**
 * Insere cada heading (HTML já pronto, ex. "<h1>II<br>A guerra</h1>") no corpo corrido, no
 * bloco (`<p>`) onde a âncora (início da página seguinte à abertura, ver extractChapterAnchors)
 * foi encontrada — antes desse bloco, nunca a meio (precisão ao nível do parágrafo chega:
 * uma abertura de capítulo começa sempre um parágrafo novo).
 */
export function insertChapterHeadings(html: string, anchors: { anchor: string; headingHtml: string }[]): { html: string; inserted: number; total: number } {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nodes: Text[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

    let flat = '';
    const map: { node: Text; offset: number }[] = [];
    for (const node of nodes) {
        const raw = node.textContent ?? '';
        for (let k = 0; k < raw.length; k++) {
            const nc = normalize(raw[k]);
            if (!nc) continue;
            flat += nc;
            map.push({ node, offset: k });
        }
    }

    const hits: { pos: number; headingHtml: string }[] = [];
    for (const { anchor, headingHtml } of anchors) {
        const pos = flat.indexOf(anchor);
        if (pos >= 0) hits.push({ pos, headingHtml });
    }
    const keep = longestIncreasing(hits.map(h => h.pos)).map(i => hits[i]);
    const points = keep.map(h => ({ ...map[h.pos], headingHtml: h.headingHtml }));
    for (let i = points.length - 1; i >= 0; i--) {
        let el: Node | null = points[i].node.parentNode;
        while (el && el.nodeType === 1 && !/^(P|H[1-6]|DIV|LI|BLOCKQUOTE|TABLE)$/i.test((el as Element).tagName)) {
            el = el.parentNode;
        }
        if (!el || !el.parentNode) continue;
        const frag = doc.createElement('div');
        frag.innerHTML = points[i].headingHtml;
        while (frag.firstChild) el.parentNode.insertBefore(frag.firstChild, el);
    }
    return { html: doc.body.innerHTML, inserted: points.length, total: anchors.length };
}

function median(nums: number[]): number {
    if (nums.length === 0) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Confirma cada candidato a p-top por linha em branco manual (marcado `data-blank-top` por
 * renderStory/idml-importer) contra o PDF de impressão: uma linha em branco no manuscrito nem
 * sempre corresponde a espaço visível no miolo (hábito de escrita, não intenção tipográfica) —
 * só se o gap vertical antes do parágrafo, no PDF, for CLARAMENTE maior que a entrelinha normal
 * da página (>1.4×) é que fica p-top; caso contrário, ou sem PDF, fica sem p-top (mais seguro
 * que assumir).
 */
export async function verifyBlankSpacing(html: string, data?: ArrayBuffer): Promise<string> {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const candidates = Array.from(doc.querySelectorAll('[data-blank-top]'));
    if (candidates.length === 0) return html;
    if (!data) {
        for (const el of candidates) el.removeAttribute('data-blank-top');
        return doc.body.innerHTML;
    }

    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: { y: number; text: string }[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const items = (await page.getTextContent()).items as { str: string; transform: number[] }[];
        const lineMap = new Map<number, { x: number; str: string }[]>();
        for (const it of items) {
            if (!it.str || !it.str.trim()) continue;
            const y = Math.round(it.transform[5]);
            (lineMap.get(y) ?? lineMap.set(y, []).get(y)!).push({ x: it.transform[4], str: it.str });
        }
        const lines = [...lineMap.entries()].sort((a, b) => b[0] - a[0])
            .map(([y, parts]) => ({ y, text: normalize(parts.sort((a, b) => a.x - b.x).map(p => p.str).join('')) }));
        pages.push(lines);
    }

    for (const el of candidates) {
        el.removeAttribute('data-blank-top');
        const key = normalize(el.textContent || '').slice(0, 40);
        if (!key) continue;
        // Curto (< 15, ex. nome de personagem "Hamlet") — startsWith seria ambíguo demais;
        // linha isolada de nome ocupa a linha TODA no PDF, exact match é fiável mesmo curto.
        const short = key.length < 15;
        for (const lines of pages) {
            const idx = lines.findIndex(l => short ? l.text === key : l.text.startsWith(key));
            // idx 0 (não encontrado/1ª linha, sem anterior p/ comparar) OU 1 (1ª linha de CORPO
            // da página — a linha 0 é o cabeçalho corrente, mesma convenção de
            // extractPdfPageAnchors) → gap mediria cabeçalho→corpo (margem de topo, sempre maior
            // que a entrelinha normal), não espaçamento real; sem confirmação possível aqui.
            if (idx <= 1) continue;
            const gap = lines[idx - 1].y - lines[idx].y;
            const gaps: number[] = [];
            for (let k = 1; k < lines.length; k++) gaps.push(lines[k - 1].y - lines[k].y);
            const normalGap = median(gaps.filter(g => g > 0 && g < 40)); // exclui outliers (colunas/quebras de página)
            if (normalGap > 0 && gap > normalGap * 1.4) el.classList.add('p-top');
            break;
        }
    }
    return doc.body.innerHTML;
}

// Índices da maior subsequência estritamente crescente de `arr` (LIS, O(n log n)).
function longestIncreasing(arr: number[]): number[] {
    const tails: number[] = [];   // tails[k] = índice do menor fim de uma subseq. de comprimento k+1
    const prev: number[] = new Array(arr.length).fill(-1);
    for (let i = 0; i < arr.length; i++) {
        let lo = 0, hi = tails.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[tails[mid]] < arr[i]) lo = mid + 1; else hi = mid; }
        if (lo > 0) prev[i] = tails[lo - 1];
        if (lo === tails.length) tails.push(i); else tails[lo] = i;
    }
    const seq: number[] = [];
    for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) seq.push(i);
    return seq.reverse();
}

/**
 * Insere marcadores de quebra de página no HTML, alinhando cada âncora do PDF ao texto do
 * editor. Cada âncora é localizada de forma INDEPENDENTE (1ª ocorrência); depois mantém-se só
 * a maior subsequência de posições CRESCENTES (LIS) — descarta outliers (ex. páginas de
 * front-matter cujo texto aparece noutro sítio) que de outra forma envenenariam um cursor
 * monotónico simples. Marcador = <span class="pagebreak" data-page="N"></span> (convertido para
 * epub:type="pagebreak" no export). Páginas sem match (ou fora da sequência) são saltadas.
 */
export function insertPageBreaks(html: string, anchors: PageAnchor[]): { html: string; inserted: number; total: number } {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // achatar text nodes do corpo: string normalizada concatenada + mapa posição→{node, offset}
    const nodes: Text[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);

    let flat = '';
    const map: { node: Text; offset: number }[] = []; // map[posNormalizada] = origem do char
    for (const node of nodes) {
        const raw = node.textContent ?? '';
        for (let k = 0; k < raw.length; k++) {
            const nc = normalize(raw[k]);
            if (!nc) continue; // char descartado pela normalização (espaço/pontuação)
            flat += nc;
            map.push({ node, offset: k });
        }
    }

    // posição independente de cada âncora (1ª ocorrência); depois LIS para manter só as crescentes
    const hits: { pos: number; page: number }[] = [];
    for (const { page, anchor } of anchors) {
        const pos = flat.indexOf(anchor);
        if (pos >= 0) hits.push({ pos, page });
    }
    const keep = longestIncreasing(hits.map(h => h.pos)).map(i => hits[i]);
    const inserted = keep.length;
    const points: { node: Text; offset: number; page: number }[] = keep.map(h => ({ ...map[h.pos], page: h.page }));
    // aplicar inserções: por nó, offsets do maior para o menor (não desloca os anteriores)
    const byNode = new Map<Text, { offset: number; page: number }[]>();
    for (const p of points) (byNode.get(p.node) ?? byNode.set(p.node, []).get(p.node)!).push(p);
    for (const [node, list] of byNode) {
        list.sort((a, b) => b.offset - a.offset);
        for (const { offset, page } of list) {
            const after = node.splitText(offset);
            const span = doc.createElement('span');
            span.className = 'pagebreak';
            span.setAttribute('data-page', String(page));
            after.parentNode!.insertBefore(span, after);
        }
    }
    return { html: doc.body.innerHTML, inserted, total: anchors.length };
}

/**
 * Converte os marcadores do editor (`<span class="pagebreak" data-page="N">`) na forma
 * semântica do EPUB e recolhe (secção, página) para a page-list. Usado no export por secção.
 */
export function convertPageBreaks(html: string, sectionNum: number, sink: { section: number; page: number }[]): string {
    // tolerante à ordem/extra de atributos (TinyMCE/DOMPurify podem reordenar)
    return html.replace(/<span\b[^>]*\bclass="[^"]*\bpagebreak\b[^"]*"[^>]*><\/span>/g, (m) => {
        const n = m.match(/\bdata-page="(\d+)"/)?.[1];
        if (!n) return m;
        sink.push({ section: sectionNum, page: parseInt(n) });
        return `<span epub:type="pagebreak" role="doc-pagebreak" id="page-${n}" aria-label="${n}"></span>`;
    });
}
