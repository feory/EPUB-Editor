// Confirma com o PDF de impressão ONDE está cada figura do livro: a legenda de uma figura casa-se com o PDF como qualquer parágrafo, e a
// ordem de leitura do PDF (página, de cima para baixo) diz entre que parágrafos a figura fica. Se no livro está noutro sítio, move-se
// (imagem + legenda) para depois do parágrafo que a antecede no PDF; se a imagem e a legenda estão trocadas, troca-as. Só trata figuras
// COM legenda (sem legenda não há texto a casar com o PDF). Puro: recebe o `PdfStyles` já lido (com as caixas das imagens).
import { fold, type PdfStyles } from './pdf-styles';
import { longestIncreasing } from './alignment';
import { findLines, flatLines, MIN_TEXT, SKIP_CHAPTER } from './style-audit';

export type FigureKind = 'posicao' | 'ordem';
export interface FigureDiff { kind: FigureKind; chapter: string; caption: string; /** Página do PDF (1-based). */ page: number; /** Posição: o parágrafo a seguir ao qual o PDF a põe. */ after?: string; fixable: boolean; why: string }

const CAPTION_RE = /^\s*(figura|fig\.?|gráfico|quadro|esquema|imagem)\s*\d/i;
const SKIP_CLASS = /^(footnote|chapter-|pagebreak)/; // as notas estão no fim da página no PDF e noutro sítio no livro: desfaziam a ordem
const FAR_PAGES = 2;       // páginas: numa página impressa a figura flutua (fica no topo/fundo) por isso só conta como fora do sítio se estiver a 2+ páginas do texto
const SHORT_KEY = 6;       // chars: primeira linha curta de uma legenda ("FIGURA 1.1")
const MAX_IMAGE_GAP = 120; // pt: a imagem tem de estar a esta distância da legenda para decidir de que lado fica
const SLACK = 4;           // pt: a baseline da legenda pode ficar um pouco dentro da caixa da imagem

const isImageBlock = (el: Element) => (el.tagName === 'IMG' || (el.tagName !== 'TABLE' && !!el.querySelector('img'))) && fold(el.textContent ?? '').length < MIN_TEXT;
const isCaption = (el: Element) => el.tagName === 'P' && !el.querySelector('img') && (el.classList.contains('p-legendas') || CAPTION_RE.test(el.textContent ?? ''));
const snippet = (el: Element) => (el.textContent ?? '').trim().slice(0, 60);

interface Unit { images: Element[]; caption: Element; captionFirst: boolean; all: Element[] }

/**
 * `strict`: não espera 2+ páginas — qualquer figura cuja ordem de leitura difere da do PDF (a legenda vem depois/antes de parágrafos
 * que o PDF põe antes/depois dela) é movida. Para a importação; o assistente mantém a tolerância de páginas (no impresso as figuras flutuam).
 */
export function reviewFigures(html: string, pdf: PdfStyles, { strict = false }: { strict?: boolean } = {}): { html: string; diffs: FigureDiff[]; /** Figuras com legenda que o PDF confirmou, e as que se viram. */ checked: number; seen: number } {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const kids = Array.from(doc.body.children);
    const flat = flatLines(pdf);

    // 1. Onde cada parágrafo (e legenda) está no PDF: posição de leitura = página × 1e4 − y (y cresce para cima).
    const chapterOf: string[] = [];
    const where = new Map<Element, { pos: number; pi: number; y: number }>();
    let chapter = '', skip = false, cursor = 0;
    kids.forEach((el) => {
        if (el.tagName === 'P' && /(^| )chapter-break/.test(el.className)) { chapter = el.getAttribute('data-title') ?? chapter; skip = SKIP_CHAPTER.test(chapter.trim()); }
        // Na importação ainda não há marcadores de capítulo (só o do frontespício): os títulos h1/h2 é que dizem onde acaba a zona a saltar.
        if (strict && /^H[12]$/.test(el.tagName)) { chapter = (el.textContent ?? '').trim() || chapter; skip = SKIP_CHAPTER.test(chapter); }
        chapterOf.push(chapter);
        if (el.tagName !== 'P' || skip || el.querySelector('img') || Array.from(el.classList).some((c) => SKIP_CLASS.test(c))) return;
        const text = fold(el.textContent ?? '');
        if (text.length < MIN_TEXT) return;
        // Uma legenda não segue o fio dos parágrafos (a figura pode estar no livro longe de onde o PDF a tem): procura-se no PDF todo e só
        // vale se for ÚNICA. Parte-se no PDF em "FIGURA 1.1" + o título, por isso aceita-se uma 1.ª linha curta se o resto a completar.
        type Found = NonNullable<ReturnType<typeof findLines>>;
        if (CAPTION_RE.test(el.textContent ?? '')) {
            const fulls: Found[] = [];
            for (let from = 0; ; ) {
                const r = findLines(flat, from, text, SHORT_KEY, Infinity);
                if (!r) break;
                if (r.full) fulls.push(r);
                from = r.end - r.match.length + 2;
            }
            if (fulls.length === 1) { const f = fulls[0].match[0]; where.set(el, { pos: f.pi * 1e4 - f.line.y, pi: f.pi, y: f.line.y }); }
            return;
        }
        const found = findLines(flat, cursor, text);
        if (!found) return;
        if (found.near) cursor = found.end + 1;
        const first = found.match[0];
        where.set(el, { pos: first.pi * 1e4 - first.line.y, pi: first.pi, y: first.line.y });
    });

    // 2. As figuras com legenda: o(s) bloco(s) de imagem seguidos + a legenda logo a seguir (ou, em falta, logo antes).
    const units: Unit[] = [];
    const used = new Set<Element>();
    let seen = 0;
    for (let i = 0; i < kids.length; i++) {
        if (!isImageBlock(kids[i]) || used.has(kids[i])) continue;
        let j = i;
        while (j + 1 < kids.length && isImageBlock(kids[j + 1])) j++;
        seen++;
        const images = kids.slice(i, j + 1);
        const after = kids[j + 1], before = kids[i - 1];
        const captionFirst = !(after && isCaption(after) && !used.has(after));
        const caption = !captionFirst ? after : before && isCaption(before) && !used.has(before) ? before : null;
        i = j;
        if (!caption) continue;
        units.push({ images, caption, captionFirst, all: captionFirst ? [caption, ...images] : [...images, caption] });
        for (const e of [...images, caption]) used.add(e);
    }

    // 3. Parágrafos de referência: só os que seguem a ordem do PDF (a maior subsequência crescente; um casamento errado não decide nada).
    const anchors = kids.map((el, idx) => ({ el, idx, w: where.get(el) })).filter((a): a is { el: Element; idx: number; w: { pos: number; pi: number; y: number } } => !!a.w && !used.has(a.el) && !isCaption(a.el));
    const reliable = longestIncreasing(anchors.map((a) => a.w.pos)).map((k) => anchors[k]);

    const diffs: FigureDiff[] = [];
    const moves: { unit: Unit; target: Element; posC: number }[] = [];
    let checked = 0;
    for (const u of units) {
        const w = where.get(u.caption);
        if (!w) continue;
        checked++;
        const start = kids.indexOf(u.all[0]), end = kids.indexOf(u.all[u.all.length - 1]);
        const prev = [...reliable].reverse().find((a) => a.idx < start), next = reliable.find((a) => a.idx > end);
        const text = snippet(u.caption);
        const late = !!prev && (strict ? prev.w.pos > w.pos : prev.w.pi - w.pi >= FAR_PAGES), early = !!next && (strict ? next.w.pos < w.pos : w.pi - next.w.pi >= FAR_PAGES);
        if (!late && !early) continue;
        // Onde pôr: a seguir ao parágrafo que cita a figura ("Figura 2.1"), se houver um perto da legenda no PDF; senão, ao que a antecede no PDF. Em `strict` só vale o PDF (o impresso pode pôr a figura depois de outra secção, não junto da citação).
        const num = /\d[\d.]*\d|\d/.exec(u.caption.textContent ?? '')?.[0];
        const cite = num && new RegExp(`\\b(figura|fig\\.?)\\s*${num.replace(/\./g, '\\.')}(?!\\d)`, 'i');
        const target = (!strict && cite && reliable.find((a) => Math.abs(a.w.pi - w.pi) <= 1 && cite.test(a.el.textContent ?? ''))) || [...reliable].reverse().find((a) => a.w.pos < w.pos);
        const here = chapterOf[start];
        const fixable = !!target && chapterOf[target.idx] === here;
        diffs.push({ kind: 'posicao', chapter: here, caption: text, page: w.pi + 1, after: target ? snippet(target.el) : undefined, fixable,
            why: !target ? 'o PDF põe a figura antes de todo o texto' : !fixable ? 'o PDF põe a figura noutro capítulo' : late ? 'o livro põe a figura páginas depois de onde está no PDF' : 'o livro põe a figura páginas antes de onde está no PDF' });
        if (fixable) moves.push({ unit: u, target: target.el, posC: w.pos });
    }

    // 4. Mover (por ordem de leitura do PDF, para que várias figuras no mesmo sítio fiquem pela ordem certa).
    const last = new Map<Element, Element>();
    for (const m of moves.sort((a, b) => a.posC - b.posC)) {
        const ref = last.get(m.target) ?? m.target;
        ref.after(...m.unit.all);
        last.set(m.target, m.unit.all[m.unit.all.length - 1]);
    }

    // 5. Imagem e legenda trocadas: a imagem mais próxima, NA MESMA página, diz de que lado da legenda está.
    for (const u of units) {
        const w = where.get(u.caption);
        const boxes = w && pdf.pages[w.pi].images;
        if (!w || !boxes?.length) continue;
        const dist = (b: { y0: number; y1: number }) => (b.y0 >= w.y - SLACK ? { above: true, gap: b.y0 - w.y } : { above: false, gap: w.y - b.y1 });
        const near = boxes.map(dist).filter((d) => d.gap <= MAX_IMAGE_GAP).sort((a, b) => a.gap - b.gap)[0];
        if (!near || near.above === !u.captionFirst) continue;
        diffs.push({ kind: 'ordem', chapter: chapterOf[kids.indexOf(u.all[0])], caption: snippet(u.caption), page: w.pi + 1, fixable: true,
            why: near.above ? 'no PDF a imagem está por cima da legenda' : 'no PDF a imagem está por baixo da legenda' });
        if (u.captionFirst) u.images[u.images.length - 1].after(u.caption); else u.images[0].before(u.caption);
    }
    return { html: diffs.some((d) => d.fixable) ? doc.body.innerHTML : html, diffs, checked, seen };
}
