export interface TextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

export interface Span {
  text: string;
  isBold: boolean;
  isItalic: boolean;
  isSmall: boolean;
  isSuperscript: boolean;
}

export interface ExtractedImage {
  id: string;
  blob: Blob;
  position: number;
  pageIndex: number;
}

export interface ExtractionResult {
  html: string;
  images: Map<string, ExtractedImage>;
}

export interface ImageSettings {
  compress: boolean;
  quality: number;
  maxWidth: number;
}

export interface ExtractionOptions {
  headerMargin?: number;
  footerMargin?: number;
  imageSettings?: ImageSettings;
}

export interface ProcessedParagraph {
  spans: Span[];
  startX: number;
  isFootnote?: boolean;  // Marcado explicitamente como nota de rodapé
}

// PDF.js internal object types (simplified)
export interface PdfObj {
  name?: string;
  data?: Uint8ClampedArray | Uint8Array;
  width?: number;
  height?: number;
  kind?: number;
  bitmap?: ImageBitmap | ArrayBufferView | ArrayBuffer;
}

export interface PdfPage {
  objs: {
    has: (name: string) => boolean;
    get: (name: string) => PdfObj;
    ensure: (name: string, callback: () => void) => void;
  };
  commonObjs: {
    has: (name: string) => boolean;
    get: (name: string) => PdfObj;
  };
  getViewport: (options: { scale: number }) => { width: number; height: number };
  getOperatorList: () => Promise<PdfOperatorList>;
  getTextContent: () => Promise<{ items: any[] }>;
}

export interface PdfOperatorList {
  fnArray: number[];
  argsArray: any[][];
}