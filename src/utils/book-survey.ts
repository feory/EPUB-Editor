// Resumo do livro para a IA planear regras (book-rules.ts) sem ler o miolo: capítulos, que blocos existem (tag + classes,
// com contagem e exemplos de texto) e os estilos criados pelo utilizador. Poucos milhares de tokens num livro grande.
// Só conta os filhos diretos do corpo — o mesmo âmbito por omissão das regras.
import { classifyChapterPart, type ChapterLevel } from './chapters';
import { customStyleClasses } from './book-css';
import { readRuleBody } from './css-rule';
import { scanSpanStyles, type SpanStyleInfo } from './inline-styles';
import { HEADING_SELECTORS, selectorOf, classesForRules } from './book-styles';

export interface BookSurvey {
    chapters: { index: number; title: string; level: ChapterLevel }[];
    /** Por "tag.classe1.classe2" (classes por ordem alfabética), do mais frequente para o menos. */
    /** `inlineStyles`: os atributos style mais comuns nesse padrão (só se houver), para ver o aspeto que vem de style inline. */
    blocks: { key: string; count: number; inChapters: number; samples: string[]; inlineStyles?: { style: string; count: number }[] }[];
    /** Padrões que ficaram de fora do limite `maxBlocks` (os mais raros). */
    omittedBlocks: number;
    customStyles: string[];
    /** Os <span style="…"> mais comuns do livro (style, contagem, em que blocos): candidatos a virar estilo de caracteres. */
    inlineSpans: SpanStyleInfo[];
    /** Classes que as regras podem acrescentar (editor + estilos do utilizador). */
    allowedClasses: string[];
    /** Corpo da regra no CSS do livro, por classe ou título h1–h3 (só os que têm regra): o valor atual para quem edita estilos. */
    styleRules: Record<string, string>;
}

const MAX_SAMPLES = 2;
const MAX_STYLES = 3;
const SAMPLE_LEN = 80;
const isMarker = (el: Element) => /\bchapter-(break|anchor)/.test(el.className);

export function surveyBook(parts: string[], customCss = '', maxBlocks = 60): BookSurvey {
    const chapters = parts.map((p, index) => ({ index, ...classifyChapterPart(p, index) })).map(({ index, title, level }) => ({ index, title, level }));
    const seen = new Map<string, { count: number; chapters: Set<number>; samples: string[]; styles: Map<string, number> }>();

    parts.forEach((part, ci) => {
        const doc = new DOMParser().parseFromString(part, 'text/html');
        for (const el of Array.from(doc.body.children)) {
            if (isMarker(el)) continue;
            const key = [el.tagName.toLowerCase(), ...Array.from(el.classList).sort()].join('.');
            const entry = seen.get(key) ?? { count: 0, chapters: new Set<number>(), samples: [], styles: new Map<string, number>() };
            entry.count++;
            entry.chapters.add(ci);
            const style = (el.getAttribute('style') || '').replace(/\s+/g, ' ').trim();
            if (style) entry.styles.set(style, (entry.styles.get(style) ?? 0) + 1);
            if (entry.samples.length < MAX_SAMPLES) {
                const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (text && !entry.samples.includes(text.slice(0, SAMPLE_LEN))) entry.samples.push(text.slice(0, SAMPLE_LEN));
            }
            seen.set(key, entry);
        }
    });

    const allowedClasses = [...classesForRules(customCss)].sort();
    const all = [...seen].map(([key, v]) => ({ key, count: v.count, inChapters: v.chapters.size, samples: v.samples, ...(v.styles.size ? { inlineStyles: [...v.styles].sort((a, b) => b[1] - a[1]).slice(0, MAX_STYLES).map(([style, count]) => ({ style, count })) } : {}) })).sort((a, b) => b.count - a.count);
    return { chapters, blocks: all.slice(0, maxBlocks), omittedBlocks: Math.max(0, all.length - maxBlocks), customStyles: customStyleClasses(customCss), inlineSpans: scanSpanStyles(parts), allowedClasses, styleRules: Object.fromEntries([...allowedClasses, ...HEADING_SELECTORS].map((c) => [c, readRuleBody(customCss, selectorOf(c))]).filter(([, body]) => body)) };
}
