// O texto das páginas do PDF (`PdfPageText[]`, de pdf-pages.ts) interpretado: folios, linhas, âncoras de página e de capítulo.
// Tudo puro: sem pdfjs nem DOM, por isso testa-se com páginas sintéticas.
import { fillFolioGaps, dropFolioOutliers } from './folio';
import type { PdfPageText } from './pdf-pages';

// `page` = folio impresso (nº que aparece na página, usado para casar com o editor);
// `pdfPageIndex` = posição física no PDF (1-based, pode divergir do folio por causa de
// front-matter sem numeração) — usado para saltar o viewer para a página certa do ficheiro.
// `lines` = as primeiras linhas de corpo da página (a 1.ª é a âncora): servem para reconhecer as páginas do Índice (isIndicePage) e para
// colocar as que o alinhamento global deixou de fora (fillMissingPageBreaks).
export interface PageAnchor { page: number; pdfPageIndex: number; anchor: string; lines?: string[] }


const MAX_ANCHOR_LINES = 60; // linhas por página guardadas nas âncoras (só em memória)

// Normaliza para casar PDF↔editor apesar de espaçamento/hifenização/pontuação diferentes:
// minúsculas, só letras (incl. acentuadas) e dígitos.
export function normalize(s: string): string {
    return s.toLowerCase().replace(/[^0-9a-zà-öø-ÿ]/g, '');
}

export const ANCHOR_LEN = 30;   // chars normalizados usados como âncora
export const MIN_ANCHOR = 15;   // mínimo para a âncora ser fiável
const SUPER_Y_TOL = 5;   // pt: desvio vertical máximo de um sobrescrito face à linha do corpo

// Âncoras de capítulo (extractChapterAnchors) precisam de mais chars que as de página: aberturas
// de capítulo do mesmo livro por vezes começam com a mesma fórmula ("Sun Tzu disse: 1. Na
// guerra...") — só divergem bem depois dos 30 chars usados para folios.
const CHAPTER_ANCHOR_LEN = 60;
export const CHAPTER_MIN_ANCHOR = 30;

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

// Folio de cada página: zona (rodapé/cabeçalho) auto-detetada por livro + interpolação das páginas sem folio.
// `printed` = os folios lidos tal e qual (null onde a página não traz folio impresso).
export function detectFolios(pages: PdfPageText[]): { folios: (number | null)[]; printed: (number | null)[] } {
    const bottom = pages.map(({ items, vpH }) => folioInZone(items, vpH, 'bottom'));
    const top = pages.map(({ items, vpH }) => folioInZone(items, vpH, 'top'));
    const printed = monotonicScore(top) > monotonicScore(bottom) ? top : bottom;
    const clean = dropFolioOutliers(printed);
    return { folios: fillFolioGaps(clean), printed: clean };
}

/**
 * anchorsFromPages — extrai, por página do PDF de impressão, o número impresso (folio) e um texto-âncora
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
/** Texto das páginas → âncoras (ver o comentário acima). Testável sem PDF. */
export function anchorsFromPages(pages: PdfPageText[]): PageAnchor[] {
    const { folios, printed: rawFolios } = detectFolios(pages);
    const anchors: PageAnchor[] = [];
    for (let idx = 0; idx < pages.length; idx++) {
        const folio = folios[idx];
        if (folio === null) continue; // sem folio, nem interpolável (front-matter) → saltar
        const hasPrintedFolio = rawFolios[idx] !== null;
        // Linha = itens com y próximo (SUPER_Y_TOL): o nº de nota sobrescrito tem y ligeiramente
        // diferente do corpo e, agrupado por y exato, partia a linha (âncora sem "(9)" ≠ texto do editor).
        const sorted = pages[idx].items.filter(it => 'str' in it && it.str).sort((a, b) => b.transform[5] - a.transform[5]);
        const lines: { y: number; parts: { x: number; str: string }[] }[] = [];
        for (const it of sorted) {
            const y = it.transform[5];
            const last = lines[lines.length - 1];
            if (last && last.y - y < SUPER_Y_TOL) last.parts.push({ x: it.transform[4], str: it.str });
            else lines.push({ y, parts: [{ x: it.transform[4], str: it.str }] });
        }
        // âncora = 1ª linha de corpo APÓS o cabeçalho corrente (linha de topo); ordenar topo→baixo
        const ordered = lines.map(l => l.parts.sort((a, b) => a.x - b.x).map(p => p.str).join(''));
        const usable = (hasPrintedFolio ? ordered.slice(1) : ordered).map(l => normalize(l).slice(0, ANCHOR_LEN)).filter(a => a.length >= MIN_ANCHOR);
        if (usable.length) anchors.push({ page: folio, pdfPageIndex: idx + 1, anchor: usable[0], lines: usable.slice(0, MAX_ANCHOR_LINES) });
    }
    return anchors;
}

/** As linhas de corpo de uma página (normalizadas, topo→baixo): sem o cabeçalho corrente (se tem folio impresso) nem a marca "….indd" do InDesign. */
export function bodyLinesOf(page: PdfPageText, hasPrintedFolio: boolean): string[] {
    const lines = pdfLines(page.items);
    return (hasPrintedFolio ? lines.slice(1) : lines).map(l => normalize(l.text)).filter(t => t && !t.includes('indd'));
}

/** Mapa folio→página física do PDF (1-based) — mesma deteção de folios das âncoras, para código que precisa de saber EM QUE página do
 *  ficheiro está um folio (ex. placeFiguresByPosition em idml/figures.ts, que recebe o folio do spread do IDML). */
export function folioToPdfPage(pages: PdfPageText[]): Map<number, number> {
    const { folios } = detectFolios(pages);
    const map = new Map<number, number>();
    folios.forEach((f, idx) => { if (f !== null) map.set(f, idx + 1); });
    return map;
}

/** Linhas de texto (y + texto normalizado) de cada página, topo→baixo — partilhada com verifyBlankSpacing e placeFiguresByPosition
 *  (idml/figures.ts), que procura a maior quebra vertical entre linhas para localizar uma figura sem legenda/nº. */
export function buildPdfLines(pages: PdfPageText[]): { y: number; text: string }[][] {
    return pages.map(({ items }) => {
        const lineMap = new Map<number, { x: number; str: string }[]>();
        for (const it of items) {
            if (!it.str || !it.str.trim()) continue;
            const y = Math.round(it.transform[5]);
            (lineMap.get(y) ?? lineMap.set(y, []).get(y)!).push({ x: it.transform[4], str: it.str });
        }
        return [...lineMap.entries()].sort((a, b) => b[0] - a[0])
            .map(([y, parts]) => ({ y, text: normalize(parts.sort((a, b) => a.x - b.x).map(p => p.str).join('')) }));
    });
}

export interface ChapterAnchor { title: string; anchor: string }

const BODY_MAX_SIZE = 14; // pt: acima disto a linha é título/subtítulo, não corpo
const MAX_PAGES_AFTER_OPENING = 4;

// Linhas de uma página (topo→baixo, itens com y próximo agrupados) + o maior corpo de letra de cada uma.
export function pdfLines(items: PdfPageText['items']): { text: string; size: number }[] {
    const sorted = items.filter(it => 'str' in it && it.str).sort((a, b) => b.transform[5] - a.transform[5]);
    const lines: { y: number; parts: { x: number; str: string }[]; size: number }[] = [];
    for (const it of sorted) {
        const y = it.transform[5];
        const last = lines[lines.length - 1];
        if (last && last.y - y < SUPER_Y_TOL) { last.parts.push({ x: it.transform[4], str: it.str }); last.size = Math.max(last.size, Math.abs(it.transform[0])); }
        else lines.push({ y, parts: [{ x: it.transform[4], str: it.str }], size: Math.abs(it.transform[0]) });
    }
    return lines.map(l => ({ text: l.parts.sort((a, b) => a.x - b.x).map(p => p.str).join(''), size: l.size }));
}

/**
 * Livros cujo corpo é uma story IDML CONTÍNUA sem CAPITULAR a marcar aberturas de capítulo
 * (única fronteira real = uma página de título dedicada, sem correspondência recuperável no
 * XML — ex. "A Arte da Guerra"): localiza cada título (já extraído do IDML) na sua página de
 * abertura do PDF de impressão e devolve o início da página SEGUINTE como âncora de onde o
 * capítulo começa no corpo corrido. Descarta páginas que contenham OUTRO título da lista
 * (índice/TOC lista todos juntos — não é a página de abertura).
 */
export function chapterAnchorsFromPages(pages: PdfPageText[], titles: string[]): ChapterAnchor[] {
    const { printed } = detectFolios(pages);
    const pageTexts = pages.map(({ items }) => normalize(items.map(it => it.str).join(' ')));
    const normTitles = titles.map(normalize);
    // Início do corpo da página: sem cabeçalho corrente (1.ª linha, nas páginas com folio), sem a marca de fecho do InDesign
    // ("Marketing 7.indd 12") e sem linhas de título (corpo grande) — o corpo real pode começar logo na página de abertura.
    const bodyAnchor = (p: number): string => {
        const lines = pdfLines(pages[p].items);
        const body = (printed[p] !== null ? lines.slice(1) : lines).filter(l => l.size <= BODY_MAX_SIZE && !normalize(l.text).includes('indd'));
        return normalize(body.map(l => l.text).join('')).slice(0, CHAPTER_ANCHOR_LEN);
    };
    const anchors: ChapterAnchor[] = [];
    for (let ti = 0; ti < titles.length; ti++) {
        const nt = normTitles[ti];
        if (nt.length < 3) continue;
        let pageIdx = -1;
        for (let p = 0; p < pageTexts.length; p++) {
            if (!pageTexts[p].includes(nt)) continue;
            const hasOther = normTitles.some((other, oi) => oi !== ti && other.length >= 3 && pageTexts[p].includes(other));
            if (hasOther) continue; // página de índice/TOC (lista vários títulos) — não é a abertura
            if (pageIdx === -1) pageIdx = p;
            // Página só com o título = abertura dedicada; vence uma página de Índice que liste só este título.
            if (pageTexts[p].length <= nt.length * 2) { pageIdx = p; break; }
        }
        if (pageIdx === -1) continue;
        // 1.ª página (a da abertura ou as seguintes: verso em branco, outra abertura sem corpo) com corpo real.
        for (let q = pageIdx; q < Math.min(pages.length, pageIdx + MAX_PAGES_AFTER_OPENING); q++) {
            const anchor = bodyAnchor(q);
            if (anchor.length < CHAPTER_MIN_ANCHOR) continue;
            anchors.push({ title: titles[ti], anchor });
            break;
        }
    }
    return anchors;
}
