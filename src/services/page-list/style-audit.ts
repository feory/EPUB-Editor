// Compara o ESTILO do livro com o do PDF de impressão: para cada parágrafo acha a(s) linha(s) onde ele aparece no PDF e vê se a
// indentação, o negrito/itálico, o centrado, o tamanho e o espaço acima batem com as classes do HTML. `reviewStyles` devolve as
// diferenças e o HTML já corrigido (a ferramenta de leitura ignora o HTML; a operação fix_styles usa-o). Puro: recebe o `PdfStyles` já lido.
import { INDENT_CONTROLLED_CLASSES, SPECIAL_INDENT_CLASSES } from '../../utils/editor-classes';
import { fold, type PdfStyles, type StyledLine, type StylePage } from './pdf-styles';

export const STYLE_KINDS = ['indent', 'emphasis', 'center', 'small', 'spacing'] as const;
export type StyleKind = typeof STYLE_KINDS[number];
export interface StyleDiff { kind: StyleKind; chapter: string; text: string; /** Página do PDF (1-based). */ page: number; add: string[]; remove: string[]; why: string }

// Limiares (pt relativos ao corpo de letra, ou fração da largura da coluna): calibrados no miolo do Marketing 7.0.
const INDENT_MIN = 0.6;      // em: abaixo disto a 1.ª linha está encostada à margem
const INDENT_MAX = 2.5;      // em: acima disto é citação/recuo de bloco, não indentação de parágrafo
const FLUSH = 0.3;           // em: |x0 - margem| até aqui = sem indentação
const CENTER_TOL = 0.03;     // fração da largura: desvio máximo do meio da linha ao meio da coluna
const CENTER_INSET = 0.1;    // a linha centrada tem de ficar longe das duas margens (senão é justificada)
const FLUSH_LEFT = 0.02;     // fração da largura: começa na margem → claramente não centrada
const SMALL_ON = 0.9;        // tamanho / corpo: abaixo disto é p-small
const SMALL_OFF = 0.97;      // …e a partir daqui já não é
const HEADING_SIZE = 1.15;   // tamanho / corpo: acima disto é título, não negrito de parágrafo
const GAP_ON = 1.4;          // espaço acima / entrelinha: acima disto há p-top (igual a verifyBlankSpacing)
const GAP_OFF = 1.15;        // …e abaixo disto não há
export const MIN_TEXT = 12;         // chars normalizados: parágrafos mais curtos casam com linhas demais
const MIN_KEY = 10;          // …e a linha do PDF tem de ter pelo menos isto (ou ser o parágrafo todo)
const NEAR = 150;            // linhas à frente do último parágrafo casado onde qualquer linha serve
const FAR_KEY = 40;          // …e a partir daí só linhas com pelo menos isto (quase inteiras: quase únicas)
const COVERED = 0.9;         // fração do texto do parágrafo que as linhas juntas têm de cobrir para falar de negrito/itálico

const SKIP_CLASS = /^(footnote|chapter-|pagebreak|drop-cap|alinea|p-legendas|p-asterisk|p-border|p-quote)/;
// Capítulos que não se revêem: o Índice (entradas, não parágrafos) e a ficha técnica (estilos escolhidos de propósito, p-small p-non-indent).
export const SKIP_CHAPTER = /^(índice|sumário|conteúdo|contents|ficha técnica|frontespício|copyright)/i;
const EMPHASIS = ['p-bold', 'p-italic', 'p-bold-italic'];
const INLINE_EMPHASIS = 'strong, b, em, i';

interface Match { first: StyledLine; lines: StyledLine[]; page: StylePage; pageIndex: number; lineIndex: number; full: boolean }

/** As linhas do PDF onde o parágrafo `text` (normalizado) aparece, a partir de `from` nas `flat`; null se não há uma correspondência segura.
 *  Com capitular a 1.ª letra é uma linha à parte no PDF, por isso se aceita também o texto sem ela (`dropCap`). */
export type FlatLine = { line: StyledLine; pi: number; li: number };
export const flatLines = (pdf: PdfStyles): FlatLine[] => pdf.pages.flatMap((page, pi) => page.lines.map((line, li) => ({ line, pi, li })));
export function findLines(flat: FlatLine[], from: number, whole: string, minKey = MIN_KEY, near = NEAR): { match: FlatLine[]; full: boolean; end: number; dropCap: boolean; near: boolean } | null {
    for (let j = from; j < flat.length; j++) {
        const key = flat[j].line.key;
        if (j >= from + near && key.length < FAR_KEY) continue; // longe do último casado só serve uma linha quase inteira (perdemos o fio: Índice, figuras…)
        for (const dropCap of [false, true]) {
            const text = dropCap ? whole.slice(1) : whole;
            if (!(text.startsWith(key) && (key.length >= minKey || key === text))) continue;
            const match = [flat[j]];
            let acc = key, end = j;
            while (acc.length < text.length && end + 1 < flat.length) {
                const next = flat[end + 1].line.key;
                const rest = text.slice(acc.length);
                if (!(rest.startsWith(next) || next.startsWith(rest))) break;
                acc += next;
                match.push(flat[++end]);
            }
            return { match, full: acc.length >= text.length * COVERED, end, dropCap, near: j < from + near };
        }
    }
    return null;
}

const emphasisOf = (el: Element): { bold: boolean; italic: boolean } => {
    const text = fold(el.textContent ?? '');
    const covered = (sel: string) => fold(Array.from(el.querySelectorAll(sel)).map((n) => n.textContent ?? '').join('')).length >= text.length;
    return {
        bold: el.classList.contains('p-bold') || el.classList.contains('p-bold-italic') || covered('strong, b'),
        italic: el.classList.contains('p-italic') || el.classList.contains('p-bold-italic') || covered('em, i'),
    };
};

function unwrapInline(el: Element) {
    for (const n of Array.from(el.querySelectorAll(INLINE_EMPHASIS))) n.replaceWith(...Array.from(n.childNodes));
}

/**
 * Revê o estilo dos parágrafos de topo do livro contra o PDF. `kinds` limita o que se revê. Só toca em parágrafos que o PDF
 * confirma (ver findLines); os que não se acham ficam como estão. Corrigir duas vezes dá o mesmo (a 2.ª já não encontra diferenças).
 */
export function reviewStyles(html: string, pdf: PdfStyles, kinds: readonly StyleKind[] = STYLE_KINDS): { html: string; diffs: StyleDiff[]; /** Parágrafos de topo que o PDF confirmou (os únicos que se reveem) e os que se viram. */ checked: number; seen: number } {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const flat = flatLines(pdf);
    const diffs: StyleDiff[] = [];
    const want = (k: StyleKind) => kinds.includes(k);
    const body = pdf.body;
    let cursor = 0, checked = 0, seen = 0, chapter = '', skipChapter = false;

    for (const el of Array.from(doc.body.children)) {
        if (el.tagName === 'P' && /(^| )chapter-break/.test(el.className)) {
            chapter = el.getAttribute('data-title') ?? chapter;
            skipChapter = SKIP_CHAPTER.test(chapter.trim());
            continue;
        }
        if (el.tagName !== 'P' || skipChapter || el.querySelector('img') || Array.from(el.classList).some((c) => SKIP_CLASS.test(c))) continue;
        const text = fold(el.textContent ?? '');
        if (text.length < MIN_TEXT) continue;
        seen++;
        const found = findLines(flat, cursor, text);
        if (!found) continue;
        if (found.near) cursor = found.end + 1; // um achado longe (capítulo noutra ordem no PDF) não leva o fio atrás de si
        checked++;
        const lines = found.match.map((m) => m.line);
        const m: Match = { first: lines[0], lines, page: pdf.pages[found.match[0].pi], pageIndex: found.match[0].pi, lineIndex: found.match[0].li, full: found.full };
        const width = m.page.right - m.page.left;
        if (width <= 0 || body <= 0) continue;
        const em = m.first.size || body;
        // Cada diferença aplica-se logo ao parágrafo: as verificações seguintes (a indentação depende de p-bold/p-center) vêem o estado final,
        // por isso uma 2.ª passagem não encontra nada de novo.
        const diff = (kind: StyleKind, add: string[], remove: string[], why: string) => {
            const a = add.filter((c) => !el.classList.contains(c)), r = remove.filter((c) => el.classList.contains(c));
            if (!a.length && !r.length) return;
            diffs.push({ kind, chapter, text: (el.textContent ?? '').trim().slice(0, 60), page: m.pageIndex + 1, add: a, remove: r, why });
            for (const c of r) el.classList.remove(c);
            for (const c of a) el.classList.add(c);
            if (kind === 'emphasis' && a.length) unwrapInline(el);
            if (kind === 'indent') (el as HTMLElement).style.removeProperty('text-indent');
            if (!el.getAttribute('class')) el.removeAttribute('class');
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        };
        const has = (c: string) => el.classList.contains(c);

        // Centrado: todas as linhas com o meio no meio da coluna e longe das margens (uma linha justificada nunca cumpre).
        const mid = (m.page.left + m.page.right) / 2;
        const centered = lines.every((l) => Math.abs((l.x0 + l.x1) / 2 - mid) <= CENTER_TOL * width && l.x0 - m.page.left >= CENTER_INSET * width && m.page.right - l.x1 >= CENTER_INSET * width);
        if (want('center')) {
            if (centered && !has('p-center')) diff('center', ['p-center'], ['p-indent', 'p-non-indent'], 'o PDF tem a linha centrada');
            else if (has('p-center') && !centered && m.first.x0 - m.page.left < FLUSH_LEFT * width) diff('center', [], ['p-center'], 'o PDF tem a linha encostada à margem');
        }

        // Negrito/itálico do parágrafo inteiro (só com o texto todo coberto pelas linhas do PDF e sem ser título).
        if (want('emphasis') && m.full && m.first.size / body <= HEADING_SIZE) {
            const bold = lines.every((l) => l.bold), italic = lines.every((l) => l.italic);
            const now = emphasisOf(el);
            const target = bold && italic ? 'p-bold-italic' : bold ? 'p-bold' : italic ? 'p-italic' : null;
            const current = now.bold && now.italic ? 'p-bold-italic' : now.bold ? 'p-bold' : now.italic ? 'p-italic' : null;
            if (target && target !== current) diff('emphasis', [target], EMPHASIS.filter((c) => c !== target).concat(target === 'p-italic' ? [] : ['p-indent']), `o PDF tem o parágrafo todo em ${target === 'p-bold' ? 'negrito' : target === 'p-italic' ? 'itálico' : 'negrito itálico'}`);
            else if (!target && has('p-bold')) diff('emphasis', [], ['p-bold'], 'o PDF tem o parágrafo sem negrito');
            else if (!target && has('p-italic')) diff('emphasis', [], ['p-italic'], 'o PDF tem o parágrafo sem itálico');
        }

        // Indentação: só em parágrafos normais (os que já controlam a indentação por classe, como p-bold/p-center, ficam de fora).
        const controlled = found.dropCap || Array.from(el.classList).some((c) => INDENT_CONTROLLED_CLASSES.includes(c) && c !== 'p-indent' && c !== 'p-non-indent') || SPECIAL_INDENT_CLASSES.some(has);
        if (want('indent') && !controlled && !centered) {
            const d = (m.first.x0 - m.page.left) / em;
            const block = lines.length > 1 && lines.every((l) => (l.x0 - m.page.left) / em > INDENT_MIN); // recuo de bloco (citação)
            if (!block && d >= INDENT_MIN && d <= INDENT_MAX && !has('p-indent')) diff('indent', ['p-indent'], ['p-non-indent'], 'o PDF tem a 1.ª linha recuada');
            else if (!block && Math.abs(d) <= FLUSH && has('p-indent')) diff('indent', [], ['p-indent'], 'o PDF tem a 1.ª linha encostada à margem');
        }

        // Tamanho
        if (want('small')) {
            const ratio = m.first.size / body;
            if (ratio < SMALL_ON && !has('p-small')) diff('small', ['p-small'], [], 'o PDF tem letra mais pequena que o corpo');
            else if (ratio >= SMALL_OFF && has('p-small')) diff('small', [], ['p-small'], 'o PDF tem a letra do corpo');
        }

        // Espaço acima: só entre dois parágrafos (com um título pelo meio a margem do título explica o salto) e sem p-bottom/p-space a fazê-lo.
        const prev = el.previousElementSibling;
        const spaced = (e: Element) => ['p-bottom', 'p-space', 'p-quote', 'p-legendas'].some((c) => e.classList.contains(c)) || Array.from(e.classList).some((c) => c.startsWith('p-border'));
        if (want('spacing') && m.lineIndex >= 2 && m.page.gap > 0 && prev?.tagName === 'P' && !spaced(prev) && !has('p-space')) {
            const gap = (m.page.lines[m.lineIndex - 1].y - m.first.y) / m.page.gap;
            if (gap > GAP_ON && !has('p-top')) diff('spacing', ['p-top'], [], 'o PDF tem espaço acima do parágrafo');
            else if (gap <= GAP_OFF && has('p-top')) diff('spacing', [], ['p-top'], 'o PDF não tem espaço acima do parágrafo');
        }
    }
    return { html: diffs.length ? doc.body.innerHTML : html, diffs, checked, seen };
}
