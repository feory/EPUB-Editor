// Importação: ficheiro (+ decisões do utilizador) → HTML canónico do editor. Único dono de duas coisas que
// antes viviam nas páginas / num hook React: a deteção de formato e a política "estruturado vs heurístico".
// Os pré-passos que alimentam modais (scanEpubClasses, analyzeBook, scanIdmlStyles…) ficam fora: são
// decisões do utilizador que antecedem este module. A gravação no servidor também (ver os chamadores).
import { cleanEditorHtml, applyImportOptions, prependFichaTecnica, type ImportOptions } from '../../utils/html-cleaner';
import { uploadExtractedImages } from './extracted-images';
import type { ExtractedDocument, DocxStyleMapping } from './document-importer';
import type { ImageSettings } from '../../components/MarginPreview';

export type ImportFormat = 'pdf' | 'docx' | 'html' | 'idml' | 'epub';

export function detectFormat(file: File): ImportFormat | null {
    const name = file.name.toLowerCase();
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx';
    if (file.type === 'text/html' || name.endsWith('.html') || name.endsWith('.htm')) return 'html';
    if (name.endsWith('.idml') || name.endsWith('.zip')) return 'idml';
    if (name.endsWith('.epub')) return 'epub';
    return null;
}

// IDML/EPUB já vêm estruturados (estilos/classes nomeados, começam por heading ou pela própria Ficha Técnica):
// saltam as conversões heurísticas e a Ficha Técnica automática (que criaria um capítulo 0 vazio / duplicaria a ficha).
const isStructured = (format: ImportFormat) => format === 'idml' || format === 'epub';

export const NO_OPTIONS: ImportOptions = {
    indentAllParagraphs: false, topOnBoldParagraphs: false, noIndentAfterBold: false,
    wrapBoldWithNext: false, convertListsToDialogue: false, detectParagraphSpacing: false,
};

export interface ImportDecisions {
    options?: ImportOptions;                      // só conta nos formatos heurísticos (PDF/Word/HTML)
    styleMapping?: DocxStyleMapping;              // Word / IDML
    epubClassMapping?: Record<string, string>;    // EPUB de plataforma antiga
    pdf?: { headerMargin: number; footerMargin: number; imageSettings: ImageSettings };
}

export interface ImportPorts {
    isbn: string;
    uploadImages: (fd: FormData) => Promise<unknown>;
}

export interface ImportResult {
    html: string;
    metadata?: ExtractedDocument['metadata'];
    cover?: Blob;
    printPdf?: ArrayBuffer;                       // PDF de impressão do zip IDML (guardar é com o chamador)
    pageBreaks?: ExtractedDocument['pageBreaks'];
    figuresPlaced?: number;
}

// Extração por formato → ExtractedDocument (html com placeholders de imagem + blobs). Imports dinâmicos:
// o pdfjs só é carregado quando um formato o precisa (HomePage tem carregamento lazy do pdfjs).
export async function extractFile(file: File, decisions: ImportDecisions): Promise<ExtractedDocument & { format: ImportFormat }> {
    const format = detectFormat(file);
    if (!format) throw new Error('Unsupported file type');
    if (format === 'pdf') {
        const { extractHtmlFromPdf } = await import('./pdf/pdf-service');
        const result = await extractHtmlFromPdf(file, decisions.pdf);
        return { format, html: result.html, images: new Map([...result.images].map(([id, img]) => [id, img.blob])) };
    }
    const { extractDocument } = await import('./document-importer');
    const { options = NO_OPTIONS, styleMapping, epubClassMapping } = decisions;
    const extracted = await extractDocument(file, {
        convertListsToDialogue: options.convertListsToDialogue, styleMapping,
        detectParagraphSpacing: options.detectParagraphSpacing, epubClassMapping,
    });
    return { format, ...extracted };
}

// Sobe as imagens e aplica a política de limpeza do formato. Separado de extractFile porque criar um ebook
// novo (HomePage) tem de criar o registo ANTES de subir as imagens.
export async function finalizeImport(
    extracted: ExtractedDocument & { format: ImportFormat }, decisions: ImportDecisions, ports: ImportPorts,
): Promise<ImportResult> {
    const uploaded = await uploadExtractedImages(ports.isbn, extracted.html, extracted.images, ports.uploadImages);
    const html = isStructured(extracted.format)
        ? cleanEditorHtml(uploaded)
        : prependFichaTecnica(applyImportOptions(cleanEditorHtml(uploaded), decisions.options ?? NO_OPTIONS));
    const { metadata, cover, printPdf, pageBreaks, figuresPlaced } = extracted;
    return { html, metadata, cover, printPdf, pageBreaks, figuresPlaced };
}

export async function importFile(file: File, decisions: ImportDecisions, ports: ImportPorts): Promise<ImportResult> {
    return finalizeImport(await extractFile(file, decisions), decisions, ports);
}
