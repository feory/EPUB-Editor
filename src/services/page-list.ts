import * as pdfjsLib from 'pdfjs-dist';
import { fillFolioGaps } from './page-list-folio';
import { PAGEBREAK_MARKER_RE, DATA_PAGE_RE } from './page-list-marker';
import { CHAPTER_SPLIT_PATTERN } from '../utils/html-cleaner';

// Worker partilhado com o pdf-service (já configurado lá); reconfigurar é idempotente.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
).toString();

// `page` = folio impresso (nº que aparece na página, usado para casar com o editor);
// `pdfPageIndex` = posição física no PDF (1-based, pode divergir do folio por causa de
// front-matter sem numeração) — usado para saltar o viewer para a página certa do ficheiro.
export interface PageAnchor { page: number; pdfPageIndex: number; anchor: string }

// Nº de páginas de um PDF — usado para distinguir o PDF de impressão (miolo, ~centenas de
// páginas) de uma figura em PDF vetorial (1-2 páginas) quando ambos vivem em Links/, sem
// depender do nome do ficheiro.
export async function getPdfPageCount(data: ArrayBuffer): Promise<number> {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    return pdf.numPages;
}

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
 * (início do corpo). Cada página COM folio impresso = cabeçalho corrente (linha de topo,
 * saltada) + folio colado ao 1º texto do corpo (ex. "41na própria…"). Páginas de front-matter
 * romano (antes de a numeração começar) continuam sem folio — não há como saber o número.
 * Aberturas de capítulo e outras páginas de título tipicamente OMITEM o folio impresso por
 * convenção tipográfica mas contam na numeração — `fillFolioGaps` interpola esse nº quando o
 * salto até à próxima página COM folio bate certo; para essas páginas não se salta a 1ª linha
 * (não há cabeçalho corrente para saltar — a própria convenção que omite o folio também omite
 * o cabeçalho), a âncora é a 1ª linha com texto suficiente, começando já na 1ª.
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
    const rawFolios = monotonicScore(topFolios) > monotonicScore(bottomFolios) ? topFolios : bottomFolios;
    const folios = fillFolioGaps(rawFolios);

    const anchors: PageAnchor[] = [];
    for (let idx = 0; idx < pages.length; idx++) {
        const folio = folios[idx];
        if (folio === null) continue; // sem folio, nem interpolável (front-matter) → saltar
        const hasPrintedFolio = rawFolios[idx] !== null;
        const lines = new Map<number, { x: number; str: string }[]>();
        for (const it of pages[idx].items) {
            if (!('str' in it) || !it.str) continue;
            const y = it.transform[5];
            (lines.get(Math.round(y)) ?? lines.set(Math.round(y), []).get(Math.round(y))!).push({ x: it.transform[4], str: it.str });
        }
        // âncora = 1ª linha de corpo APÓS o cabeçalho corrente (linha de topo); ordenar topo→baixo
        const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0])
            .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map(p => p.str).join(''));
        for (const line of hasPrintedFolio ? ordered.slice(1) : ordered) {
            const anchor = normalize(line).slice(0, ANCHOR_LEN);
            if (anchor.length < MIN_ANCHOR) continue;
            anchors.push({ page: folio, pdfPageIndex: idx + 1, anchor });
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

// Remove marcadores de page-list já existentes — usado por insertPageBreaks (idempotência) e
// por quem precisar de os descartar sem reinserir.
export function stripPageBreaks(html: string): string {
    return html.replace(PAGEBREAK_MARKER_RE, '');
}

/**
 * Insere marcadores de quebra de página num ÚNICO segmento (capítulo) do HTML, alinhando cada
 * âncora do PDF ao texto desse segmento. Cada âncora é localizada a partir de um CURSOR que só
 * avança (âncoras chegam em ordem de página do PDF, logo em ordem esperada no corpo) — não da
 * 1ª ocorrência no documento inteiro: um título de capítulo/secção usado como âncora aparece
 * tipicamente TAMBÉM no Índice do próprio livro, bem antes da abertura real; procurar sempre
 * desde o início encontrava sistematicamente essa ocorrência do Índice em vez da real, e o LIS
 * (ver abaixo) descartava-a por ficar fora de ordem com as âncoras vizinhas — perdendo a página
 * toda mesmo com a âncora a existir corretamente no corpo, só que mais à frente. Sem match a
 * partir do cursor, cai para uma procura desde o início (ex. capítulo fora de ordem por uma
 * edição) — o LIS a seguir continua a servir de rede de segurança, mantendo só a maior
 * subsequência de posições CRESCENTES, para não deixar esse fallback (ou outro outlier genuíno)
 * envenenar a sequência. Páginas sem match (ou fora da sequência) são saltadas — inclui, aqui,
 * todas as que pertencem a OUTRO segmento (ver insertPageBreaks).
 * Marcador = <span class="pagebreak" data-page="N"></span> (convertido para epub:type="pagebreak"
 * no export).
 */
function insertPageBreaksInSegment(html: string, anchors: PageAnchor[]): { html: string; inserted: number } {
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

    // cursor só avança: acha a ocorrência a partir de onde a âncora anterior ficou, não a 1ª do
    // documento (evita colidir com o Índice); sem match à frente, cai para a 1ª ocorrência global.
    let cursor = 0;
    const hits: { pos: number; page: number }[] = [];
    for (const { page, anchor } of anchors) {
        let pos = flat.indexOf(anchor, cursor);
        if (pos < 0) pos = flat.indexOf(anchor);
        if (pos < 0) continue;
        hits.push({ pos, page });
        cursor = Math.max(cursor, pos);
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
    return { html: doc.body.innerHTML, inserted };
}

// data-page="N" já inserido — usado só para saber que páginas cada passo já colocou (não
// PAGEBREAK_MARKER_RE: esse casa o <span> inteiro, aqui só interessa o número, global).
const INSERTED_PAGE_RE = /data-page="(\d+)"/g;
const pagesIn = (html: string): Set<number> =>
    new Set([...html.matchAll(INSERTED_PAGE_RE)].map(m => parseInt(m[1])));

/**
 * Insere marcadores de quebra de página no HTML, em 2 passos.
 *
 * 1º passo — GLOBAL (insertPageBreaksInSegment sobre o documento inteiro): idêntico ao
 * comportamento histórico, preserva exatamente o que já funcionava (zero regressão nos livros
 * normais — testado contra uma peça com falas curtas repetidas por vários capítulos, ex.
 * "Martinez interrompendo": o cursor único global sabe desambiguar qual ocorrência é a certa
 * porque vê o livro inteiro; um corte por capítulo aí SÓ PIORA, cada capítulo vê a fala em
 * isolado e não sabe qual das repetições lhe pertence).
 *
 * 2º passo — POR CAPÍTULO, só para as páginas que o 1º passo NÃO encontrou. Livros bilingues
 * (tradução PT contínua + texto original EN reagrupado à parte, em vez de intercalado página a
 * página como no PDF impresso) quebram o cursor global: ao encontrar uma página do bloco EN, o
 * cursor salta lá para a frente, e a página PT seguinte (que no corpo continua logo a seguir à
 * PT anterior, bem atrás de onde o cursor ficou) passa a parecer "fora de ordem" — o LIS
 * descarta-a, perdendo metade das páginas em ziguezague. Para essas (só essas — já falharam no
 * 1º passo, não há nada a perder), tenta-se de novo por capítulo: cada bloco de idioma fica com
 * o seu próprio cursor, sem um roubar a posição do outro; dentro de CADA capítulo a ordem
 * PDF↔corpo volta a ser monótona (o capítulo é só um dos dois blocos). Processa os capítulos em
 * ORDEM, removendo da lista de "faltam" cada página assim que aparece — evita o mesmo capítulo
 * marcar 2x a mesma página caso o texto se repita também dentro do 2º passo.
 * Idempotente: remove marcadores pré-existentes antes de inserir (reexecutar sobre um livro já
 * marcado, ex. page-list gerada de novo a partir de um PDF carregado mais tarde, não duplica).
 */
export function insertPageBreaks(html: string, anchors: PageAnchor[]): { html: string; inserted: number; total: number } {
    const stripped = stripPageBreaks(html);
    const pass1 = insertPageBreaksInSegment(stripped, anchors);

    let remaining = anchors.filter(a => !pagesIn(pass1.html).has(a.page));
    if (remaining.length === 0) return { html: pass1.html, inserted: pass1.inserted, total: anchors.length };

    let extraInserted = 0;
    const outSegments = pass1.html.split(CHAPTER_SPLIT_PATTERN).map(seg => {
        if (remaining.length === 0) return seg;
        const r = insertPageBreaksInSegment(seg, remaining);
        if (r.inserted === 0) return seg;
        const justAdded = [...pagesIn(r.html)].filter(p => !pagesIn(seg).has(p));
        remaining = remaining.filter(a => !justAdded.includes(a.page));
        extraInserted += justAdded.length;
        return r.html;
    });
    return { html: outSegments.join(''), inserted: pass1.inserted + extraInserted, total: anchors.length };
}

/**
 * Converte os marcadores do editor (`<span class="pagebreak" data-page="N">`) na forma
 * semântica do EPUB e recolhe (secção, página) para a page-list. Usado no export por secção.
 */
export function convertPageBreaks(html: string, sectionNum: number, sink: { section: number; page: number }[]): string {
    return html.replace(PAGEBREAK_MARKER_RE, (m) => {
        const n = m.match(DATA_PAGE_RE)?.[1];
        if (!n) return m;
        sink.push({ section: sectionNum, page: parseInt(n) });
        return `<span epub:type="pagebreak" role="doc-pagebreak" id="page-${n}" aria-label="${n}"></span>`;
    });
}
