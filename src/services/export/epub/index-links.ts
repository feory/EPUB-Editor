// Resolve os marcadores `idx-link`/`chapter-anchor` (src/utils/indice-links.ts) em links reais
// no export do EPUB. O livro é dividido em sectionN.xhtml por capítulo — o Índice está quase
// sempre num ficheiro diferente do capítulo-alvo, por isso a resolução do href tem de saber em
// que secção cada id caiu. Puro (sem DOM/JSZip) — testável com bun test.

import type { Section } from './types';
import { PAGEBREAK_MARKER_RE, DATA_PAGE_RE } from '../../page-list/marker';
import { IDX_LINK_SPAN_RE } from '../../../utils/indice-marker';

const ID_PATTERN = /\bid="([^"]+)"/g;

/**
 * id → nº de secção (1-based, mesma numeração de section${i+1}.xhtml). Construído a partir de
 * sections[i].content ANTES do loop de export: linkFootnotes/convertPageBreaks só ACRESCENTAM
 * ids novos (fn-/fnref-/page-), nunca renomeiam os existentes — por isso este mapa continua
 * válido dentro do loop por-secção mesmo depois de essas duas transformações correrem. Os ids
 * `page-N` são pré-calculados aqui (a partir do `data-page` já presente no editor, mesmo
 * marcador/regex de page-list-marker.ts — único dono da forma HTML, partilhado com page-list.ts
 * sem arrastar o pdfjs-dist para este módulo, propositadamente puro) porque só nascem tarde de
 * mais no loop de export para entrar neste mapa da forma normal.
 */
export function buildIdToSectionMap(sections: Section[]): Map<string, number> {
    const map = new Map<string, number>();
    sections.forEach((section, i) => {
        ID_PATTERN.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = ID_PATTERN.exec(section.content)) !== null) map.set(m[1], i + 1);
        PAGEBREAK_MARKER_RE.lastIndex = 0;
        while ((m = PAGEBREAK_MARKER_RE.exec(section.content)) !== null) {
            const page = m[0].match(DATA_PAGE_RE)?.[1];
            if (page) map.set(`page-${page}`, i + 1);
        }
    });
    return map;
}

/**
 * Converte <span class="idx-link" data-target="idx-anchor-N"> num <a> real — só pode nascer
 * aqui, DEPOIS de cleanHtmlForXhtml (que remove qualquer <a> em fases anteriores). `#id` se o
 * alvo vive na mesma secção, `sectionN.xhtml#id` se estiver noutra. Alvo sem correspondência
 * (marcador dessincronizado) → mantém só o texto, nunca um `href="#"` morto.
 */
export function convertIndexLinks(html: string, idToSection: Map<string, number>, currentSectionIdx: number): string {
    // IDX_LINK_SPAN_RE (indice-marker.ts) tolera ordem de atributos e <span> aninhado; data-target lê-se à parte da tag.
    return html.replace(
        IDX_LINK_SPAN_RE,
        (m, inner: string) => {
            const targetId = m.match(/\bdata-target="([^"]*)"/)?.[1];
            const targetSection = targetId ? idToSection.get(targetId) : undefined;
            if (!targetSection || !targetId) return inner;
            const href = targetSection === currentSectionIdx ? `#${targetId}` : `section${targetSection}.xhtml#${targetId}`;
            return `<a href="${href}">${inner}</a>`;
        },
    );
}
