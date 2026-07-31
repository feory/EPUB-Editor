// Resolve os marcadores `idx-link`/`chapter-anchor` (src/utils/indice-links.ts) em links reais
// no export do EPUB. O livro é dividido em sectionN.xhtml por capítulo — o Índice está quase
// sempre num ficheiro diferente do capítulo-alvo, por isso a resolução do href tem de saber em
// que secção cada id caiu. Puro (sem DOM/JSZip) — testável com bun test.

import type { Section } from './types';

const ID_PATTERN = /\bid="([^"]+)"/g;

/**
 * id → nº de secção (1-based, mesma numeração de section${i+1}.xhtml). Construído a partir de
 * sections[i].content ANTES do loop de export: linkFootnotes/convertPageBreaks só ACRESCENTAM
 * ids novos (fn-/fnref-/page-), nunca renomeiam os existentes — por isso este mapa continua
 * válido dentro do loop por-secção mesmo depois de essas duas transformações correrem.
 */
export function buildIdToSectionMap(sections: Section[]): Map<string, number> {
    const map = new Map<string, number>();
    sections.forEach((section, i) => {
        ID_PATTERN.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = ID_PATTERN.exec(section.content)) !== null) map.set(m[1], i + 1);
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
    // Tolerante à ordem de atributos (TinyMCE/DOMPurify podem reordenar, mesmo cuidado de
    // convertPageBreaks): casa o <span> só pela classe, extrai data-target à parte da tag.
    // O conteúdo pode ter um <span> aninhado (marcador de page-list, cai no mesmo <p> do Índice) —
    // [\s\S]*? sozinho pararia no 1º </span>, que seria o do span aninhado, não o deste idx-link
    // (cortava a tag a meio → "Opening and ending tag mismatch" no leitor). O grupo alternado
    // consome qualquer <span>...</span> completo como bloco atómico antes de parar num </span>.
    return html.replace(
        /<span\b[^>]*\bclass="[^"]*\bidx-link\b[^"]*"[^>]*>((?:<span\b[^>]*>[\s\S]*?<\/span>|(?!<\/span>)[\s\S])*)<\/span>/g,
        (m, inner: string) => {
            const targetId = m.match(/\bdata-target="([^"]*)"/)?.[1];
            const targetSection = targetId ? idToSection.get(targetId) : undefined;
            if (!targetSection || !targetId) return inner;
            const href = targetSection === currentSectionIdx ? `#${targetId}` : `section${targetSection}.xhtml#${targetId}`;
            return `<a href="${href}">${inner}</a>`;
        },
    );
}
