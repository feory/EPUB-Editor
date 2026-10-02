/**
 * Nome do capítulo a partir do `<title>` de um ficheiro XHTML de um EPUB.
 * Devolve '' quando o `<title>` não é um título: vazio, sem letras nem números, ou igual ao nome do
 * ficheiro (o InDesign põe o nome do ficheiro quando a página não tem título).
 * Usado pelo importador de EPUB e pelo skill epub-indesign (.claude/skills/epub-indesign).
 */
export function chapterTitleOf(title: string, href: string): string {
    const t = title.trim();
    const fileName = href.split('/').pop()!.replace(/\.x?html?$/i, '');
    return /[\p{L}\p{N}]/u.test(t) && t !== fileName ? t : '';
}
