// Política de títulos do InDesign (decidida pelo utilizador). O `<title>` de cada ficheiro é o nome do
// capítulo no editor; o InDesign deixa títulos falsos (rótulo copiado da ficha, nome do ficheiro…).
// A regra genérica "isto não é um título" é da app (src/utils/chapter-title.ts) — aqui só o que é InDesign:
//  - rótulo de ficha técnica num parágrafo (autor/autora, revisão, capa, ISBN…) → "Ficha Técnica", em qualquer página
//  - ficha técnica (©/ISBN/Título original) com título falso, ou antes do Índice → "Ficha Técnica"
//  - rótulo copiado da ficha ("Título:", "Título original:") → "Rosto"
//  - antes do Índice, com títulos ou imagem → "Rosto"; texto simples (dedicatória) mantém o título
//  - sem título (vazio/nome do ficheiro) fica como está → o importador junta-o ao capítulo anterior
import { chapterTitleOf } from '../../utils/chapter-title';

export type TitlePage = {
    title: string; href: string; bodyText: string;
    paragraphs: string[];   // texto de cada parágrafo (para reconhecer rótulos de ficha técnica)
    frontMatter: boolean;   // página antes do Índice
    hasImage: boolean;
    hasHeading: boolean;    // tinha estilos mapeados como título (h1–h6)
};

const FICHA_LABEL = /^(autor|autora|autores|revis[ãa]o|capa|design da capa|isbn)(\s*:|\s|$)/i;

export function indesignTitle(p: TitlePage): string {
    const t = p.title.trim();
    // rótulo da ficha copiado para o <title> pelo InDesign — só "Título"/"Título original" (com ou sem ":");
    // outros títulos que acabam em ":" (ex. "Sun Tzu disse:") são títulos reais
    const label = /^t[íi]tulo( original)?:?$/i.test(t);
    const noTitle = !chapterTitleOf(t, p.href);
    const ficha = /©|ISBN|Dep[óo]sito legal|T[íi]tulo original/i.test(p.bodyText);
    // rótulo = parágrafo curto que COMEÇA pela palavra ("autor", "revisão: X", "ISBN 978…") — no meio de um
    // capítulo ("o autor defende…", bibliografia com ISBN) não conta
    const fichaLabel = p.paragraphs.some(t => t.length < 120 && FICHA_LABEL.test(t.trim()));
    if (fichaLabel || (ficha && (label || noTitle || p.frontMatter))) return 'Ficha Técnica';
    if (!noTitle && (label || (p.frontMatter && (p.hasHeading || p.hasImage)))) return 'Rosto';
    return p.title;
}
