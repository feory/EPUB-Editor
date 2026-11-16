// Alinhamento do texto do PDF com o HTML do livro: onde cada página começa no corpo, e os marcadores `<span class="pagebreak">` que o dizem.
// `insertPageBreaks` é a porta: a ordem dos passes (limpar, Índice, alinhamento global, Índice, mover, completar) vive aqui dentro.
// Puro: DOM e texto, sem pdfjs (o texto das páginas vem de pdf-text.ts). Quem só quer perguntar ao corpo usa `readBodyText`.
import { PAGEBREAK_MARKER_RE } from './marker';
import { normalize, CHAPTER_MIN_ANCHOR, type PageAnchor } from './pdf-text';
import { splitChapterSegments } from '../../utils/chapters';
import { isIndiceChapterTitle } from '../../utils/indice-links';
import { BREAK_SELECTOR, LEVEL_BREAK_SELECTOR, createPageHolder } from '../../utils/chapter-filler';

/** O que o PDF diz de uma página SEM marcador, em pouco espaço: o folio e as primeiras linhas de corpo que o livro também tem (âncoras de ANCHOR_LEN caracteres). Autocontido: dá para guardar num plano. */
export interface PageLines { page: number; lines: string[] }

/**
 * A página do PDF é do Índice? Quando pelo menos metade das suas linhas (e pelo menos duas) são texto do Índice. Uma abertura de
 * capítulo também tem linhas no Índice (o subtítulo), mas tem corpo que o Índice não tem; com uma só linha não se decide.
 */
function isIndicePage(ti: ReturnType<typeof textIndex>, lines: string[]): boolean {
    return ti.indice.at >= 0 && lines.length >= 2 && lines.filter(l => ti.indice.flat.includes(l)).length * 2 >= lines.length;
}

/**
 * As páginas do Índice de entre `pages`: o Índice é um bloco CONTÍGUO de páginas, por isso contam só as candidatas seguidas a partir
 * da primeira (a 1.ª que não é do Índice fecha-o) e só as anteriores aos marcadores do corpo que já existam. Sem isto, uma abertura de
 * capítulo com só título e subtítulo (que também estão no Índice) passava por página do Índice.
 */
function indicePagesOf<T extends { page: number }>(ti: ReturnType<typeof textIndex>, pages: T[], linesOf: (p: T) => string[]): T[] {
    const high = Math.min(Infinity, ...ti.markers.filter(m => m.pos >= ti.indice.at).map(m => m.page));
    const own: T[] = [];
    for (const p of [...pages].sort((a, b) => a.page - b.page)) {
        if (p.page >= high) break;
        if (isIndicePage(ti, linesOf(p))) own.push(p);
        else if (own.length) break;
    }
    return own;
}

/** Onde pôr os marcadores das páginas do Índice: dentro do Índice, cada uma na 1.ª das suas linhas que existe depois da anterior. */
function indicePoints(ti: ReturnType<typeof textIndex>, pages: { page: number; lines: string[] }[]): { node: Text; offset: number; page: number }[] {
    const { indice } = ti;
    const have = new Set(indice.markers.map(m => m.page));
    const points: { node: Text; offset: number; page: number }[] = [];
    for (const { page, lines } of [...pages].sort((a, b) => a.page - b.page)) {
        if (have.has(page)) continue;
        const lo = Math.max(0, ...indice.markers.filter(m => m.page < page).map(m => m.pos));
        const hi = Math.min(indice.flat.length, ...indice.markers.filter(m => m.page > page).map(m => m.pos));
        for (const line of lines) {
            const at = indice.flat.indexOf(line, lo);
            if (at < 0 || at >= hi) continue;
            indice.markers.push({ page, pos: at });
            points.push({ ...indice.map[at], page });
            break;
        }
    }
    return points;
}

/**
 * Corrige a lista de páginas: para cada página do PDF SEM marcador, procura no corpo a 1.ª das suas linhas que lá exista, mas só
 * ENTRE o marcador da página anterior e o da seguinte — a janela é o que o alinhamento global não tinha (descartava-as por ficarem
 * fora da ordem, ou a âncora era texto de figura que o corpo não tem). Só acrescenta marcadores; nunca mexe nos que já existem.
 * Páginas sem nenhuma linha no corpo (brancas, só figura) ficam como estavam. Devolve as páginas que inseriu.
 */
export function fillMissingPageBreaks(html: string, pages: PageLines[]): { html: string; inserted: number[] } {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ti = textIndex(doc);
    const { flat, map, markers, indice } = ti;
    const have = new Set([...markers, ...indice.markers].map(m => m.page));
    const known = [...markers]; // os que já existem + os que se vão acrescentando: definem as janelas das páginas seguintes
    // Só contam os marcadores em ordem (a maior subsequência crescente de posições): um marcador existente fora do sítio (ex. a p.247
    // dentro do capítulo 2) apertava a janela das páginas do meio até ficar vazia. Os fora de sítio não se tocam, só se ignoram.
    const reliable = () => {
        const sorted = [...known].sort((a, b) => a.page - b.page);
        return longestIncreasing(sorted.map((m, i) => m.pos + i * 1e-6)).map(i => sorted[i]); // + i·1e-6: duas páginas na mesma posição não se excluem
    };
    const indicePages = indicePagesOf(ti, pages.filter(p => !have.has(p.page)), p => p.lines);
    const points: { node: Text; offset: number; page: number }[] = indicePoints(ti, indicePages);
    for (const { page, lines } of [...pages].sort((a, b) => a.page - b.page)) {
        if (have.has(page) || indicePages.some(p => p.page === page)) continue;
        const trusted = reliable();
        const lo = Math.max(0, ...trusted.filter(m => m.page < page).map(m => m.pos));
        const hi = Math.min(flat.length, ...trusted.filter(m => m.page > page).map(m => m.pos));
        for (const line of lines) {
            const at = flat.indexOf(line, lo);
            if (at < 0 || at >= hi) continue;
            known.push({ page, pos: at });
            points.push({ ...map[at], page });
            break;
        }
    }
    if (points.length === 0) return { html, inserted: [] };
    applyMarkers(doc, points);
    return { html: movePageBreaksToChapterStart(doc.body.innerHTML), inserted: points.map(p => p.page).sort((a, b) => a - b) };
}

// Índice do texto do corpo: todos os text nodes achatados numa string normalizada (`flat`) e, por posição nela,
// o nó e o offset de origem (`map[pos]`) — para inserir marcadores no ponto exato onde uma âncora casa.
// Chars que a normalização descarta (espaço, pontuação) não entram em nenhum dos dois.
/** Texto máximo de uma entrada do Índice; um bloco maior já é corpo. */
const INDICE_ENTRY_MAX = 150;
interface IndiceIndex { flat: string; map: { node: Text; offset: number }[]; markers: { page: number; pos: number }[]; /** Onde o Índice começa, em `flat` do corpo (-1 = não há Índice). */ at: number }

function textIndex(doc: Document): { flat: string; map: { node: Text; offset: number }[]; markers: { page: number; pos: number }[]; indice: IndiceIndex } {
    let flat = '';
    // O texto do Índice fica fora de `flat` (as suas linhas repetem as do corpo e roubavam-lhe marcadores), mas com índice próprio:
    // as páginas do Índice têm marcador, dentro do Índice.
    const indice: IndiceIndex = { flat: '', map: [], markers: [], at: -1 };
    const map: { node: Text; offset: number }[] = [];
    // Marcadores de página já no corpo e a posição (em `flat`) onde estão; os do Índice ficam de fora (não são do corpo).
    const markers: { page: number; pos: number }[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    // Capítulo Índice fora do alinhamento: as suas linhas repetem títulos/subtítulos do corpo e roubavam-lhes os marcadores.
    let inIndice = false;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeType === 1) {
            const el = n as Element;
            if (el.matches(BREAK_SELECTOR)) inIndice = isIndiceChapterTitle(el.getAttribute('data-title') ?? '');
            // Na importação ainda não há marcadores de capítulo: o Índice é só um bloco com o texto "Índice".
            else if (el.matches('p,h1,h2,h3') && isIndiceChapterTitle(el.textContent ?? '')) inIndice = true;
            else if (el.matches('span.pagebreak[data-page]')) {
                const page = parseInt(el.getAttribute('data-page')!, 10);
                if (inIndice) indice.markers.push({ page, pos: indice.flat.length }); else markers.push({ page, pos: flat.length });
            }
            if (inIndice && indice.at < 0) indice.at = flat.length;
            continue;
        }
        const node = n as Text;
        // O Índice acaba no 1.º bloco longo (entradas são curtas); nem sempre há outro marcador de capítulo a seguir.
        if (inIndice && (node.parentElement?.closest('p,div,li,h1,h2,h3,h4,h5,h6')?.textContent ?? '').length > INDICE_ENTRY_MAX) inIndice = false;
        if (inIndice) {
            const text = node.textContent ?? '';
            for (let k = 0; k < text.length; k++) { const nc = normalize(text[k]); if (nc) { indice.flat += nc; indice.map.push({ node, offset: k }); } }
            continue;
        }
        const raw = node.textContent ?? '';
        for (let k = 0; k < raw.length; k++) {
            const nc = normalize(raw[k]);
            if (!nc) continue;
            flat += nc;
            map.push({ node, offset: k });
        }
    }
    return { flat, map, markers, indice };
}


/**
 * O texto do corpo de um HTML, para quem só precisa de PERGUNTAR (o diagnóstico): que páginas já têm marcador, se uma linha
 * (normalizada, ≤ ANCHOR_LEN) existe no corpo ou no Índice, e se uma página é do Índice. Esconde o `textIndex` (a forma
 * `{flat, map, markers, indice}` é do alinhamento, que o usa para inserir; ninguém mais a deve conhecer).
 */
export interface BodyText {
    markedPages(): Set<number>;
    inBody(line: string): boolean;
    inIndice(line: string): boolean;
    isIndicePage(lines: string[]): boolean;
}

export function readBodyText(html: string): BodyText {
    const ti = textIndex(new DOMParser().parseFromString(html, 'text/html'));
    return {
        markedPages: () => new Set([...ti.markers, ...ti.indice.markers].map(m => m.page).filter(n => !isNaN(n))),
        inBody: (line) => ti.flat.includes(line),
        inIndice: (line) => ti.indice.flat.includes(line),
        isIndicePage: (lines) => isIndicePage(ti, lines),
    };
}

/**
 * Insere cada heading (HTML já pronto, ex. "<h1>II<br>A guerra</h1>") no corpo corrido, no
 * bloco (`<p>`) onde a âncora (início da página seguinte à abertura, ver extractChapterAnchors)
 * foi encontrada — antes desse bloco, nunca a meio (precisão ao nível do parágrafo chega:
 * uma abertura de capítulo começa sempre um parágrafo novo).
 */
export function insertChapterHeadings(html: string, anchors: { anchor: string; headingHtml: string }[]): { html: string; inserted: number; total: number } {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const { flat, map } = textIndex(doc);

    // A página impressa abre com o folio (cabeçalho/rodapé), que não existe no corpo: sem match, tenta sem o
    // nº inicial (devolve a âncora efetivamente usada, para a repetição mais abaixo).
    const locate = (anchor: string, from = 0): { pos: number; anchor: string } => {
        const pos = flat.indexOf(anchor, from);
        if (pos >= 0) return { pos, anchor };
        const bare = anchor.replace(/^\d+/, '');
        return bare.length >= CHAPTER_MIN_ANCHOR && bare !== anchor ? { pos: flat.indexOf(bare, from), anchor: bare } : { pos: -1, anchor };
    };
    const hits: { pos: number; headingHtml: string; anchor: string }[] = [];
    for (const { anchor, headingHtml } of anchors) {
        const found = locate(anchor);
        if (found.pos >= 0) hits.push({ pos: found.pos, headingHtml, anchor: found.anchor });
    }
    const keptIdx = new Set(longestIncreasing(hits.map(h => h.pos)));
    // Âncora também presente antes (ex. título repetido no Índice): 1.ª ocorrência fora de ordem foi
    // descartada → repetir a busca depois do último hit mantido, sem passar o seguinte.
    let from = -1;
    const keep: { pos: number; headingHtml: string; anchor: string }[] = [];
    for (let i = 0; i < hits.length; i++) {
        if (keptIdx.has(i)) { from = hits[i].pos; keep.push(hits[i]); continue; }
        const next = hits.findIndex((_, k) => k > i && keptIdx.has(k));
        const p = flat.indexOf(hits[i].anchor, from + 1);
        if (p >= 0 && (next === -1 || p < hits[next].pos)) { from = p; keep.push({ ...hits[i], pos: p }); }
    }
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

const PASS2_MIN_ANCHOR = 20; // âncora mínima para o 2º passo (por capítulo)
const MAX_OCCURRENCES = 50;  // âncoras que se repetem mais que isto (frases-feitas) já não identificam a página

// Uma ocorrência por âncora (cands[i] = posições crescentes), maximizando as posições estritamente
// crescentes — LIS com alternativas: as de uma mesma âncora entram da maior para a menor, para
// duas ocorrências da mesma página nunca se encadearem.
function pickChain(cands: { pos: number; page: number }[][]): { pos: number; page: number }[] {
    const nodes: { pos: number; page: number; prev: number }[] = [];
    const tails: number[] = [];   // tails[k] = nó com o menor fim de uma cadeia de comprimento k+1
    for (const list of cands) {
        for (let c = list.length - 1; c >= 0; c--) {
            const { pos, page } = list[c];
            let lo = 0, hi = tails.length;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (nodes[tails[mid]].pos < pos) lo = mid + 1; else hi = mid; }
            nodes.push({ pos, page, prev: lo > 0 ? tails[lo - 1] : -1 });
            tails[lo] = nodes.length - 1;
        }
    }
    const seq: { pos: number; page: number }[] = [];
    for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = nodes[i].prev) seq.push(nodes[i]);
    return seq.reverse();
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
    const { flat, map } = textIndex(doc);

    // TODAS as ocorrências de cada âncora; `pickChain` escolhe a combinação com mais páginas em
    // posições crescentes. Um cursor único era envenenado por 1 hit errado (ex. "Espíritos Livres" do
    // rosto a casar no corpo): saltava para a frente e a ocorrência certa das páginas seguintes
    // ficava para trás, perdendo-as (ex. p.31).
    const cands = anchors.map(({ page, anchor }) => {
        const list: { pos: number; page: number }[] = [];
        for (let p = flat.indexOf(anchor); p >= 0 && list.length < MAX_OCCURRENCES; p = flat.indexOf(anchor, p + 1)) list.push({ pos: p, page });
        return list;
    });
    const keep = pickChain(cands);
    const inserted = keep.length;
    applyMarkers(doc, keep.map(h => ({ ...map[h.pos], page: h.page })));
    return { html: doc.body.innerHTML, inserted };
}

/** Escreve os marcadores `<span class="pagebreak" data-page>` nos pontos dados: por nó, offsets do maior para o menor (não desloca os anteriores). */
function applyMarkers(doc: Document, points: { node: Text; offset: number; page: number }[]): void {
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
function insertPageBreaksCore(html: string, anchors: PageAnchor[]): { html: string; inserted: number; total: number } {
    const stripped = stripPageBreaks(html);
    const pass1 = insertPageBreaksInSegment(stripped, anchors);

    // Âncoras curtas (títulos/rosto, ex. "Espíritos Livres") só valem no 1º passo, global e ordenado: por capítulo
    // casavam em qualquer parte do corpo e punham a página fora de sítio.
    let remaining = anchors.filter(a => a.anchor.length >= PASS2_MIN_ANCHOR && !pagesIn(pass1.html).has(a.page));
    if (remaining.length === 0) return { html: pass1.html, inserted: pass1.inserted, total: anchors.length };

    let extraInserted = 0;
    const outSegments = splitChapterSegments(pass1.html).map(seg => {
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

/** Texto (normalizado) máximo entre o marcador de capítulo e o marcador de página para este contar como "abertura do capítulo". */
const CHAPTER_OPENING_MAX = 150;

/**
 * Quando o marcador de página cai logo a seguir à abertura de um capítulo h1/h2 (só os blocos curtos do título — caixa com o
 * número, subtítulo, etc. — entre o marcador de capítulo e o de página), é porque o capítulo abre nessa página: o marcador passa
 * para o início do capítulo (antes do 1.º texto a seguir ao marcador de capítulo). O mesmo html se nada mexe (sem reserializar).
 */
export function movePageBreaksToChapterStart(html: string): string {
    if (!html.includes('pagebreak')) return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let moved = 0;
    for (const marker of Array.from(doc.body.querySelectorAll(LEVEL_BREAK_SELECTOR))) {
        let firstText: Text | null = null;
        let textLen = 0;
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n && n !== marker; n = walker.nextNode()) { /* avança até ao marcador (currentNode não é fiável em todos os DOMs) */ }
        let target: Element | null = null;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (marker.contains(node)) continue; // o texto do próprio marcador (&nbsp;) não conta
            if (node.nodeType === 1) {
                const el = node as Element;
                if (el.matches(BREAK_SELECTOR)) break; // chegou ao capítulo seguinte
                if (el.matches('span.pagebreak')) { target = el; break; }
                continue;
            }
            const text = (node.textContent ?? '').replace(/\s+/g, '');
            if (!text) continue;
            firstText ??= node as Text;
            textLen += text.length;
            if (textLen > CHAPTER_OPENING_MAX) break;
        }
        if (!target || !firstText || textLen === 0) continue; // sem marcador na abertura, ou já está no início
        // Bloco de topo que abre o capítulo (caixa ou título): o marcador fica ENTRE o limite do capítulo e esse bloco, numa <div>
        // própria com um &nbsp; (como o marcador de capítulo). <div> e não <p>: não entra na contagem dos <p> das Ligações do Índice.
        let top: Node = firstText;
        while (top.parentNode && top.parentNode !== doc.body) top = top.parentNode;
        top.parentNode!.insertBefore(createPageHolder(doc, target), top);
        moved++;
    }
    return moved > 0 ? doc.body.innerHTML : html;
}

export function insertPageBreaks(html: string, anchors: PageAnchor[]): { html: string; inserted: number; total: number } {
    // As páginas do Índice não entram no alinhamento do corpo (a âncora da p.9, a 1.ª entrada, casava com o título "PARTE I" e o
    // capítulo ficava com a página do Índice): têm o seu marcador, dentro do Índice.
    const ti = textIndex(new DOMParser().parseFromString(stripPageBreaks(html), 'text/html'));
    const own = indicePagesOf(ti, anchors, a => a.lines ?? []);
    const res = insertPageBreaksCore(html, anchors.filter(a => !own.includes(a)));
    const doc = new DOMParser().parseFromString(res.html, 'text/html');
    const points = indicePoints(textIndex(doc), own.map(a => ({ page: a.page, lines: a.lines! })));
    if (points.length) applyMarkers(doc, points);
    const placed = movePageBreaksToChapterStart(points.length ? doc.body.innerHTML : res.html);
    // 2.º passo: as páginas que o alinhamento global deixou de fora (abrem com texto de figura, ou ficaram fora de ordem) entram
    // na janela entre os marcadores vizinhos (o mesmo que o fix_page_list do assistente), a partir das linhas das âncoras.
    const filled = fillMissingPageBreaks(placed, anchors.filter(a => a.lines?.length).map(a => ({ page: a.page, lines: a.lines! })));
    return { html: filled.html, inserted: res.inserted + points.length + filled.inserted.length, total: anchors.length };
}
