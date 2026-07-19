import * as pdfjsLib from 'pdfjs-dist';
import type {
  ExtractionOptions,
  ExtractionResult,
  TextItem,
  Span,
  ProcessedParagraph,
  ExtractedImage,
  PdfPage
} from './pdf/types';
import { extractImagesFromPage } from './pdf/image-processor';
import { PdfHeuristics } from './pdf/heuristics';
import {
  consolidateSplitFootnotes,
  consolidateSplitParagraphs,
  finalCleanup,
  fixFootnoteNumbers,
  consolidateFootnoteContinuations
} from './pdf/post-processor';
// Re-export types for backward compatibility
export type { ExtractedImage, ExtractionResult };

// Configure the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Extract HTML and images from a PDF file
 */
export const extractHtmlFromPdf = async (file: File, options: ExtractionOptions = {}): Promise<ExtractionResult> => {
  const { headerMargin = 0, footerMargin = 0, imageSettings } = options;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const heuristics = new PdfHeuristics();

  let fullHtml = '';
  const allImages = new Map<string, ExtractedImage>();

  for (let i = 1; i <= pdf.numPages; i++) {
    heuristics.setCurrentPage(i);
    const page = await pdf.getPage(i) as unknown as PdfPage;
    const operatorList = await page.getOperatorList();
    const textContent = await page.getTextContent();
    const commonObjs = page.commonObjs;
    const objs = page.objs;

    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;

    const minY = pageHeight * footerMargin / 100;
    const maxY = pageHeight - (pageHeight * headerMargin / 100);

    // 1. Extract Images
    const pageImages = await extractImagesFromPage(page, i, operatorList, minY, maxY, imageSettings);
    pageImages.forEach(img => allImages.set(img.id, img));
    const sortedImages = [...pageImages].sort((a, b) => b.position - a.position);

    // 2. Filter Text Items
    const items = (textContent.items as any[])
      .filter((item) => 'str' in item)
      .filter((item) => {
        const itemY = item.transform[5];
        return itemY >= minY && itemY <= maxY;
      }) as TextItem[];

    // 3. Process Text with Heuristics
    heuristics.resetPageMetrics();
    items.forEach(item => heuristics.updateMetrics(item));

    const paragraphs: ProcessedParagraph[] = [];
    let currentParagraph: Span[] = [];
    let currentIsFootnote = false;  // Track se o parágrafo atual é nota de rodapé
    let lastY = -1, lastX = -1, lastFontSize = 0, paragraphStartX = -1;
    let baselineFontSize = 0;  // Tamanho da fonte do texto normal (não superscript)

    for (const item of items) {
      const currentY = item.transform[5];
      const currentX = item.transform[4];
      const fontSize = item.transform[3];
      const text = item.str;

      // Verificar se entramos/saímos de uma secção de índice
      heuristics.checkForTocSection(text);

      const { isBold, isItalic, isSmall } = heuristics.getFontStyles(item, commonObjs, objs);

      // Atualizar baseline font size (só para texto normal, não superscript)
      if (fontSize >= 9 && fontSize <= 14 && baselineFontSize === 0) {
        baselineFontSize = fontSize;
      }

      // IMPORTANTE: Verificar superscript ANTES de decidir se é novo parágrafo
      // Números curtos com fonte pequena devem ficar no parágrafo atual como <sup>
      const trimmedText = text.trim();

      // Verificar se é um ou mais números (ex: "58" ou "58 59")
      const multipleNumbersMatch = trimmedText.match(/^(\d{1,3})(\s+\d{1,3})*$/);
      const comparisonFontSize = baselineFontSize > 0 ? baselineFontSize : lastFontSize;
      const lastSpanIsSuperscript = currentParagraph.length > 0 &&
        currentParagraph[currentParagraph.length - 1].isSuperscript;

      // Não considerar superscript se estamos numa secção de índice
      const isPotentialSuperscript = lastY !== -1 &&
        multipleNumbersMatch &&
        !heuristics.getIsInTocSection() &&
        (fontSize < comparisonFontSize * 0.95 || (currentY - lastY) > 0.5 || lastSpanIsSuperscript);

      if (isPotentialSuperscript && currentParagraph.length > 0) {
        const horizontalGap = currentX - lastX;

        // Verificar se o parágrafo atual contém padrão de índice (. . ou ...)
        const currentParagraphText = currentParagraph.map(s => s.text).join('');
        const hasTocDots = /\.\s*\.\s*\./.test(currentParagraphText) || /\.{3,}/.test(currentParagraphText);

        // Se está muito longe horizontalmente, pode não ser superscript do mesmo texto
        // Mas se o último span também era superscript, ser mais permissivo
        const maxGap = lastSpanIsSuperscript ? fontSize * 5 : fontSize * 3;

        if (horizontalGap < maxGap && !hasTocDots) {
          // Dividir múltiplos números e adicionar cada um como superscript separado
          const numbers = trimmedText.split(/\s+/);
          for (let n = 0; n < numbers.length; n++) {
            if (n > 0) {
              // Adicionar espaço entre números
              currentParagraph.push({ text: ' ', isBold: false, isItalic: false, isSmall: false, isSuperscript: false });
            }
            currentParagraph.push({ text: numbers[n], isBold, isItalic, isSmall: false, isSuperscript: true });
          }
          lastY = currentY;
          lastX = currentX + (item.width || 0);
          lastFontSize = fontSize;
          continue;
        }
      }

      let { isNew } = heuristics.isNewParagraph(item, lastY, lastX, lastFontSize, paragraphStartX);

      // Force separation if it looks like a footnote, even with small vertical gap
      if (!isNew && lastY !== -1) {
        const verticalGap = lastY - currentY;
        const lineHeight = fontSize || lastFontSize || 10;

        // If it's a new line, check if it's a footnote
        if (verticalGap > (lineHeight * 0.5)) {
          const potentialFootnote = heuristics.processFootnoteStart(text, isBold, isItalic, isSmall, currentY, fontSize);
          if (potentialFootnote) {
            isNew = true;
          }
        }
      }

      if (isNew) {
        if (currentParagraph.length > 0) {
          paragraphs.push({ spans: currentParagraph, startX: paragraphStartX, isFootnote: currentIsFootnote });
        }
        currentParagraph = [];
        currentIsFootnote = false;
        paragraphStartX = currentX;

        const footnoteSpans = heuristics.processFootnoteStart(text, isBold, isItalic, isSmall, currentY, fontSize);
        if (footnoteSpans) {
          currentParagraph.push(...footnoteSpans);
          currentIsFootnote = true;  // Marcar explicitamente como nota
        } else {
          currentParagraph.push({ text, isBold, isItalic, isSmall, isSuperscript: false });
        }
      } else {
        const isSuperscript = heuristics.detectSuperscript(item, lastY, lastFontSize);
        const isNewLine = (lastY - currentY) > (fontSize * 0.5);

        if (isNewLine) {
          const lastSpan = currentParagraph[currentParagraph.length - 1];
          let cleanedText = text;
          if (lastSpan && lastSpan.text.endsWith('-')) {
            lastSpan.text = lastSpan.text.slice(0, -1);
          } else if (lastSpan && !lastSpan.text.endsWith(' ')) {
            cleanedText = ' ' + text;
          }

          if (lastSpan && lastSpan.isBold === isBold && lastSpan.isItalic === isItalic && lastSpan.isSmall === isSmall && !lastSpan.isSuperscript) {
            lastSpan.text += cleanedText;
          } else {
            currentParagraph.push({ text: cleanedText, isBold, isItalic, isSmall, isSuperscript: false });
          }
        } else {
          // SAME LINE
          const horizontalGap = currentX - lastX;
          let prefix = '';
          if (Math.abs(horizontalGap) > (fontSize * 0.2) && text.trim().length > 0) {
            const lastSpan = currentParagraph[currentParagraph.length - 1];
            if (lastSpan && !lastSpan.text.endsWith(' ') && !text.startsWith(' ')) {
              prefix = ' ';
            }
          }

          const fullText = prefix + text;
          const lastSpan = currentParagraph[currentParagraph.length - 1];

          if (lastSpan && lastSpan.isBold === isBold && lastSpan.isItalic === isItalic && lastSpan.isSmall === isSmall && lastSpan.isSuperscript === isSuperscript) {
            lastSpan.text += fullText;
          } else {
            currentParagraph.push({ text: fullText, isBold, isItalic, isSmall, isSuperscript });
          }
        }
      }

      lastY = currentY;
      lastX = currentX + (item.width || 0);
      lastFontSize = fontSize;
    }

    if (currentParagraph.length > 0) {
      paragraphs.push({ spans: currentParagraph, startX: paragraphStartX, isFootnote: currentIsFootnote });
    }

    // 4. Render Page HTML
    let pageHtml = '';

    for (const p of paragraphs) {
      const rendered = heuristics.renderParagraph(p);
      if (rendered) pageHtml += rendered;
    }

    if (sortedImages.length > 0) {
      pageHtml += '\n' + sortedImages.map(img =>
        `<img data-image-id="${img.id}" src="placeholder" alt="Imagem extraída do PDF" loading="lazy" />`
      ).join('\n');
    }

    if (pageHtml.length > 0) fullHtml += pageHtml;
  }

  // 5. Post-Processing
  let processed = fixFootnoteNumbers(fullHtml);              // Adicionar <sup> aos números das notas
  processed = consolidateFootnoteContinuations(processed);   // Juntar continuações de notas
  processed = consolidateSplitFootnotes(processed);          // Juntar notas sem número
  processed = consolidateSplitParagraphs(processed);         // Juntar parágrafos divididos
  // processed = linkFootnotes(processed);                   // MOVED TO EPUB EXPORT

  return {
    html: finalCleanup(processed),
    images: allImages
  };
};