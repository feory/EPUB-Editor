// Texto alternativo em massa: encontra as imagens do livro com alt por escrever (com o contexto que ajuda a descrevê-las)
// e aplica o que o utilizador aceitou. Puro (DOM do parser), sem rede: quem gera os textos é o servidor (routes/ai.js).
import { classifyChapterPart } from './chapters';
import { imageIdsOf } from './book-image';
import { DECORATIVE_ATTR, needsAlt } from './image-alt';

export interface BookImage {
    id: string;
    /** Quantas <img> do livro usam esta imagem (um só alt serve para todas). */
    count: number;
    chapter: string;
    /** Texto do bloco antes e depois da imagem (a legenda costuma estar num deles). */
    before: string;
    after: string;
    /** O alt atual (da primeira ocorrência) e se está marcada como decorativa. Por escrever = needsAlt(alt, decorative). */
    alt: string;
    decorative: boolean;
    /** As ocorrências têm alts diferentes: gravar um texto novo uniformiza-as. */
    mixed: boolean;
}
/** `overwrite`: substitui um alt já escrito (edição do utilizador); sem ele só se preenchem os por escrever. */
export interface AltDecision { id: string; alt: string; decorative?: boolean; overwrite?: boolean }

const CONTEXT_LEN = 240;
const text = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, CONTEXT_LEN);
const isDecorative = (img: Element) => img.getAttribute(DECORATIVE_ATTR) === 'true';
// Blocos sem texto (só a imagem) não servem de contexto: salta-se para o vizinho seguinte.
function neighbour(block: Element | null, dir: 'previousElementSibling' | 'nextElementSibling'): string {
    for (let el = block?.[dir] ?? null; el; el = el[dir]) {
        const t = text(el);
        if (t) return t;
    }
    return '';
}
const blockOf = (img: Element): Element => {
    let el: Element = img;
    while (el.parentElement && el.parentElement.tagName !== 'BODY') el = el.parentElement;
    return el;
};

/** Todas as imagens do livro (uma entrada por imagem, por ordem de aparição) com o alt atual. */
/** O texto à volta de uma <img> (blocos vizinhos): a legenda costuma estar num deles. */
const imageContext = (img: Element): { before: string; after: string } => {
    const block = blockOf(img);
    return { before: neighbour(block, 'previousElementSibling'), after: neighbour(block, 'nextElementSibling') };
};

export function scanImages(parts: string[]): BookImage[] {
    const byId = new Map<string, BookImage>();
    parts.forEach((part, i) => {
        if (!part.includes('<img')) return;
        const doc = new DOMParser().parseFromString(part, 'text/html');
        for (const img of Array.from(doc.body.querySelectorAll('img'))) {
            const id = imageIdsOf(img)[0];
            if (!id) continue;
            const decorative = isDecorative(img);
            const alt = decorative ? '' : (img.getAttribute('alt') || '').trim();
            const seen = byId.get(id);
            if (seen) { seen.count++; if (seen.alt !== alt || seen.decorative !== decorative) seen.mixed = true; continue; }
            byId.set(id, { id, count: 1, chapter: classifyChapterPart(part, i).title, ...imageContext(img), alt, decorative, mixed: false });
        }
    });
    return [...byId.values()];
}

/** As imagens com alt por escrever. */
export const scanPendingImages = (parts: string[]): BookImage[] => scanImages(parts).filter((im) => needsAlt(im.alt, im.decorative));

/**
 * Escreve os alts em TODAS as <img> da imagem. Sem `overwrite` só nas que ainda estão por escrever (um alt escrito entretanto
 * nunca se sobrepõe); com `overwrite` (edição explícita do utilizador) substitui também o que já lá está. Devolve as partes novas (as intactas, a mesma string) e quantas <img> mudaram.
 */
export function setImageAlts(parts: string[], decisions: AltDecision[]): { parts: string[]; changed: number } {
    const byId = new Map(decisions.map((d) => [d.id, d]));
    let changed = 0;
    const out = parts.map((part) => {
        if (!part.includes('<img')) return part;
        const doc = new DOMParser().parseFromString(part, 'text/html');
        let dirty = false;
        for (const img of Array.from(doc.body.querySelectorAll('img'))) {
            const d = imageIdsOf(img).map((id) => byId.get(id)).find(Boolean);
            if (!d || (!d.overwrite && !needsAlt(img.getAttribute('alt'), isDecorative(img)))) continue;
            const wasAlt = img.getAttribute('alt'), wasDecorative = isDecorative(img);
            if (d.decorative) { img.setAttribute('alt', ''); img.setAttribute(DECORATIVE_ATTR, 'true'); }
            else { img.setAttribute('alt', d.alt); img.removeAttribute(DECORATIVE_ATTR); }
            if (wasAlt === img.getAttribute('alt') && wasDecorative === !!d.decorative) continue; // já estava assim
            dirty = true; changed++;
        }
        return dirty ? doc.body.innerHTML : part;
    });
    return { parts: out, changed };
}
