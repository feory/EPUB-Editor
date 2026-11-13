// Auditoria do livro para a IA: anomalias de formatação calculadas aqui (determinístico) e entregues no resumo (survey_book).
// O modelo não procura nada: lê esta lista, explica por ordem de importância e propõe correções quando uma regra as apanha.
// Tudo pode ser intencional (uma citação, um verso): são avisos, não erros.
import { customStyleClasses } from './book-css';

export interface BookAudit {
    /** Títulos que saltam de nível (h1 → h3, sem h2 pelo meio). */
    headingJumps: { chapter: number; from: string; to: string; text: string }[];
    /** Blocos com `style` inline cujos vizinhos (anterior e seguinte) não têm: destoam do resto. `index` = posição no corpo da parte. */
    inlineStyleOutliers: { chapter: number; index: number; text: string; style: string }[];
    /** Estilos do utilizador que ninguém usa, ou usados uma só vez (candidatos a apagar ou a fundir). */
    styleUsage: { unused: string[]; usedOnce: string[] };
    /** Quantos achados cada lista tem a mais do que as mostradas (as listas são cortadas para poupar tokens). */
    omitted: { headingJumps: number; inlineStyleOutliers: number };
}

const MAX_FINDINGS = 12;
const TEXT_LEN = 60;
const isMarker = (el: Element) => /\bchapter-(break|anchor)/.test(el.className);
const flat = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s: string) => flat(s).slice(0, TEXT_LEN);

export function auditBook(parts: string[], customCss = ''): BookAudit {
    const jumps: BookAudit['headingJumps'] = [];
    const outliers: BookAudit['inlineStyleOutliers'] = [];
    const uses = new Map<string, number>();
    let prevLevel = 0;

    parts.forEach((part, ci) => {
        const doc = new DOMParser().parseFromString(part, 'text/html');
        for (const el of Array.from(doc.body.querySelectorAll('*'))) for (const c of Array.from(el.classList)) uses.set(c, (uses.get(c) ?? 0) + 1);
        for (const h of Array.from(doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
            const level = Number(h.tagName[1]);
            if (prevLevel && level > prevLevel + 1) jumps.push({ chapter: ci, from: `h${prevLevel}`, to: h.tagName.toLowerCase(), text: clip(h.textContent) });
            prevLevel = level;
        }
        const body = Array.from(doc.body.children);
        body.forEach((el, index) => {
            const style = flat(el.getAttribute('style'));
            if (!style || isMarker(el) || el.tagName === 'HR') return;
            const around = [body[index - 1], body[index + 1]].filter((n): n is Element => !!n && !isMarker(n) && n.tagName !== 'HR');
            if (around.length === 2 && around.every((n) => !n.getAttribute('style'))) outliers.push({ chapter: ci, index, text: clip(el.textContent), style });
        });
    });

    const custom = customStyleClasses(customCss);
    return {
        headingJumps: jumps.slice(0, MAX_FINDINGS),
        inlineStyleOutliers: outliers.slice(0, MAX_FINDINGS),
        styleUsage: { unused: custom.filter((c) => !uses.get(c)), usedOnce: custom.filter((c) => uses.get(c) === 1) },
        omitted: { headingJumps: Math.max(0, jumps.length - MAX_FINDINGS), inlineStyleOutliers: Math.max(0, outliers.length - MAX_FINDINGS) },
    };
}
