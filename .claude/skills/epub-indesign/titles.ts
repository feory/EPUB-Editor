// Política de títulos do InDesign (decidida pelo utilizador). O `<title>` de cada ficheiro é o nome do
// capítulo no editor; o InDesign deixa títulos falsos (rótulo copiado da ficha, nome do ficheiro…).
// A regra genérica "isto não é um título" é da app (src/utils/chapter-title.ts) — aqui só o que é InDesign:
//  - ficha técnica (©/ISBN/Título original) com título falso, ou antes do Índice → "Ficha Técnica"
//  - rótulo copiado da ficha ("Título:", "Título original:") → "Rosto"
//  - antes do Índice, com títulos ou imagem → "Rosto"; texto simples (dedicatória) mantém o título
//  - sem título (vazio/nome do ficheiro) fica como está → o importador junta-o ao capítulo anterior
import { chapterTitleOf } from '../../../src/utils/chapter-title';

export type TitlePage = {
    title: string; href: string; bodyText: string;
    frontMatter: boolean;   // página antes do Índice
    hasImage: boolean;
    hasHeading: boolean;    // tinha estilos mapeados como título (h1–h6)
};

export function indesignTitle(p: TitlePage): string {
    const t = p.title.trim();
    const label = /:$/.test(t) || /^t[íi]tulo( original)?$/i.test(t);
    const noTitle = !chapterTitleOf(t, p.href);
    const ficha = /©|ISBN|Dep[óo]sito legal|T[íi]tulo original/i.test(p.bodyText);
    if (ficha && (label || noTitle || p.frontMatter)) return 'Ficha Técnica';
    if (!noTitle && (label || (p.frontMatter && (p.hasHeading || p.hasImage)))) return 'Rosto';
    return p.title;
}
