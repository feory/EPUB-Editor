import type { TextItem, Span, ProcessedParagraph, PdfPage } from './types';
import { decodeEntities } from '../../utils/entities';

/**
 * Heuristics to detect styles and structures in text items
 */
export class PdfHeuristics {
  private bodyFontSize = 0;
  private minPageX = 9999;
  private maxLineX = 0;
  private isInTocSection = false;
  private currentPageNumber = 0;
  private skipFootnotesUntilPage = 5; // Ignorar notas nas primeiras N páginas

  constructor() {}

  public setCurrentPage(pageNum: number): void {
    this.currentPageNumber = pageNum;
  }

  public isInInitialPages(): boolean {
    return this.currentPageNumber <= this.skipFootnotesUntilPage;
  }

  public checkForTocSection(text: string): void {
    // Detetar início de secção de índice
    const tocKeywords = /^(índice|indice|sumário|sumario|conteúdo|conteudo|table of contents|contents)$/i;
    if (tocKeywords.test(text.trim())) {
      this.isInTocSection = true;
    }
    // Detetar fim de secção de índice (novo capítulo/secção principal)
    const endTocKeywords = /^(capítulo|capitulo|chapter|parte|part|introdução|introducao|introduction|prefácio|prefacio|preface)\b/i;
    if (endTocKeywords.test(text.trim()) && this.isInTocSection) {
      this.isInTocSection = false;
    }
  }

  public getIsInTocSection(): boolean {
    return this.isInTocSection;
  }

  public resetTocSection(): void {
    this.isInTocSection = false;
  }

  public resetPageMetrics() {
    this.minPageX = 9999;
    this.maxLineX = 0;
  }

  public updateMetrics(item: TextItem) {
    const currentX = item.transform[4];
    const fontSize = item.transform[3];
    const currentWidth = item.width || 0;
    const currentEndX = currentX + currentWidth;

    if (currentX > 5 && currentX < this.minPageX) {
      this.minPageX = currentX;
    }

    if (fontSize >= 9 && fontSize <= 14 && this.bodyFontSize === 0) {
      this.bodyFontSize = fontSize;
    }

    if (currentEndX > this.maxLineX) {
      this.maxLineX = currentEndX;
    }
  }

  public getFontStyles(item: TextItem, commonObjs: PdfPage['commonObjs'], objs: PdfPage['objs']) {
    let realFontName = '';
    if (commonObjs && commonObjs.has(item.fontName)) {
      realFontName = commonObjs.get(item.fontName).name || '';
    } else if (objs && objs.has(item.fontName)) {
      realFontName = objs.get(item.fontName).name || '';
    }

    const fontNameLower = realFontName.toLowerCase();
    const isBold = /bold|bd|demi|heavy|black|medi|w6|w7|w8|w9/i.test(fontNameLower) || /bold|bd/i.test(item.fontName);
    const isItalic = /italic|oblique|cursiv/i.test(fontNameLower) || /ital|it\d/i.test(item.fontName) || Math.abs(item.transform[2]) > 0.05;
    const fontSize = item.transform[3];
    const isSmall = this.bodyFontSize > 0 && fontSize < (this.bodyFontSize * 0.95);

    return { isBold, isItalic, isSmall, fontSize };
  }

  public isNewParagraph(
    item: TextItem, 
    lastY: number, 
    lastX: number, 
    lastFontSize: number, 
    paragraphStartX: number
  ): { isNew: boolean; isRaggedRight: boolean } {
    const currentY = item.transform[5];
    const currentX = item.transform[4];
    const fontSize = item.transform[3];
    
    const verticalGap = lastY - currentY;
    const lineHeight = fontSize || lastFontSize || 10;
    
    const isVerticalParagraph = verticalGap > (lineHeight * 1.1);
    const isIndentedParagraph = lastY !== -1 && (verticalGap > lineHeight * 0.5) && (currentX - paragraphStartX) > (fontSize * 0.5);
    
    let isRaggedRight = false;
    const isNewLine = verticalGap > (lineHeight * 0.5);
    if (isNewLine && this.maxLineX > 0 && lastX > 0) {
      const estimatedPageWidth = this.maxLineX - paragraphStartX;
      const emptySpace = this.maxLineX - lastX;
      if (estimatedPageWidth > 0 && (emptySpace / estimatedPageWidth) > 0.10) {
        isRaggedRight = true;
      }
    }
    
    const isSizeChangeBlock = isNewLine && lastFontSize > 0 && Math.abs(fontSize - lastFontSize) > 1.2;

    return {
      isNew: lastY === -1 || isVerticalParagraph || isIndentedParagraph || isRaggedRight || isSizeChangeBlock,
      isRaggedRight
    };
  }

  public detectSuperscript(item: TextItem, lastY: number, lastFontSize: number): boolean {
    const currentY = item.transform[5];
    const fontSize = item.transform[3];
    const yOffset = currentY - lastY;
    
    const isRaisedText = yOffset > 0.5;
    const isSmallerFont = fontSize < (lastFontSize * 0.95);
    const isShortNumeric = /^\d{1,3}$/.test(item.str.trim());
    
    return (isRaisedText || (isSmallerFont && isShortNumeric)) && item.str.trim().length <= 4;
  }

  public processFootnoteStart(text: string, isBold: boolean, isItalic: boolean, isSmall: boolean, currentY: number, fontSize: number): Span[] | null {
    // Ignorar notas nas primeiras páginas (capa, ficha técnica, índice, etc.)
    if (this.isInInitialPages()) return null;

    // Ignorar se estamos numa secção de índice
    if (this.isInTocSection) return null;

    // Ignorar linhas com padrão de índice (. . ou ...)
    if (/\.\s*\.\s*\./.test(text) || /\.{3,}/.test(text)) return null;

    const numericPattern = /^(\s*)(\d{1,3})([.\s)\-:,]*)(.*)$/;
    const asteriskPattern = /^(\s*)(\*+)([.\s]*)(.*)$/;

    const numMatch = text.match(numericPattern);
    const astMatch = text.match(asteriskPattern);
    const isBottomZone = currentY < 200;  // Zona mais restrita (fundo real da página)

    // Condição para notas de rodapé:
    // - Texto pequeno em qualquer lugar, OU
    // - Zona inferior da página com fonte pequena (< 11)
    const isFootnoteCondition = isSmall || (isBottomZone && fontSize < 11);

    if (!isFootnoteCondition) return null;

    if (numMatch && numMatch[2].length <= 3) {
      const [, spaces, number, separator, remainingText] = numMatch;
      const spans: Span[] = [];
      if (spaces) spans.push({ text: spaces, isBold, isItalic, isSmall: false, isSuperscript: false });
      spans.push({ text: number, isBold, isItalic, isSmall: false, isSuperscript: true });
      if (separator) spans.push({ text: separator, isBold, isItalic, isSmall: false, isSuperscript: false });
      if (remainingText) spans.push({ text: remainingText, isBold, isItalic, isSmall, isSuperscript: false });
      return spans;
    }

    if (astMatch) {
      const [, spaces, asterisks, separator, remainingText] = astMatch;
      const spans: Span[] = [];
      if (spaces) spans.push({ text: spaces, isBold, isItalic, isSmall: false, isSuperscript: false });
      spans.push({ text: asterisks, isBold, isItalic, isSmall: false, isSuperscript: true });
      if (separator) spans.push({ text: separator, isBold, isItalic, isSmall: false, isSuperscript: false });
      if (remainingText) spans.push({ text: remainingText, isBold, isItalic, isSmall, isSuperscript: false });
      return spans;
    }

    return null;
  }

  public renderParagraph(pData: ProcessedParagraph): string {
    const { spans, startX, isFootnote } = pData;
    const indentDiff = startX - this.minPageX;
    const isDeepIndented = this.minPageX < 9999 && indentDiff > 50;
    // Usar a flag explícita OU deteção por isSmall (mas não nas primeiras páginas)
    const isFootnoteParagraph = !this.isInInitialPages() && (isFootnote || spans.some(span => span.isSmall && span.text.trim().length > 0));
    const fullText = spans.map(s => s.text).join('').trim();
    const isSeparator = /^(\*\s*){3,}$/.test(fullText);

    let pTagAttrs = '';
    if (isFootnoteParagraph) {
      pTagAttrs = ' class="footnote"';
    } else if (isSeparator) {
      pTagAttrs = ' class="p-no-indent-margin-top" style="text-align: center"';
    } else if (isDeepIndented) {
      const indentPx = Math.round(indentDiff);
      pTagAttrs = ` style="text-indent: ${indentPx}px"`;
    }

    const innerHtml = spans.map(span => {
      let s = decodeEntities(span.text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      if (span.isBold) s = `<strong>${s}</strong>`;
      if (span.isItalic) s = `<em>${s}</em>`;
      if (span.isSuperscript) s = `<sup>${s}</sup>`;
      if (span.isSmall && !isFootnoteParagraph) s = `<small>${s}</small>`;
      return s;
    }).join('');

    if (innerHtml.trim().length === 0) return '';
    return `<p${pTagAttrs}>${innerHtml}</p>`;
  }
}
