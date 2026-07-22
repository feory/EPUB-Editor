import React, { createContext, useContext, useState } from 'react';

export const DEFAULT_CSS = `
    /* === TIPOGRAFIA === */
    @font-face {
        font-family: "Crimson Text";
        src: url("Fonts/CrimsonText-Regular.ttf");
        font-weight: normal;
        font-style: normal;
    }
    @font-face {
        font-family: "Crimson Text";
        src: url("Fonts/CrimsonText-Italic.ttf");
        font-weight: normal;
        font-style: italic;
    }
    @font-face {
        font-family: "Crimson Text";
        src: url("Fonts/CrimsonText-Bold.ttf");
        font-weight: bold;
        font-style: normal;
    }
    @font-face {
        font-family: "Crimson Text";
        src: url("Fonts/CrimsonText-BoldItalic.ttf");
        font-weight: bold;
        font-style: italic;
    }

    /* === ESTRUTURA BASE === */
    body {
        font-family: "Crimson Text", "DejaVu Serif", Georgia, serif;
        margin: 5%;
        line-height: 1.5;
        color: #1a1a1a;
        font-size: 1.1em;
    }

    h1 { margin-top: 2em; font-size: 1.8em; line-height: 1.2; }
    h2 { margin-top: 1.5em; margin-bottom: 1.5em; font-weight: normal; color: #444; }

    /* === PARÁGRAFOS === */
    p {
        margin-bottom: 0;
        margin-top: 0;
        text-indent: 0;
        text-align: justify;
        line-height: 2.0em;
        hyphens: auto;
        -webkit-hyphens: auto;
        -moz-hyphens: auto;
        adobe-hyphenate: explicit;
    }

    /* === ESTILOS DE PARÁGRAFO === */
    .p-non-indent { text-indent: 0 !important; }
    .p-indent     { text-indent: 2.15em !important; }
    .p-top        { margin-top: 30px !important; }
    .p-center     { text-align: center !important; text-indent: 0 !important; }
    .p-space      { margin-top: 100px !important; }
    .p-bottom     { margin-bottom: 30px !important; }
    .p-quote      { margin-left: 4.5em !important; font-size: 0.85em !important; }
    .p-bold       { font-weight: bold !important; }
    .p-italic     { font-style: italic !important; }
    .p-bold-italic { font-weight: bold !important; font-style: italic !important; }
    .p-asterisk   { text-align: center !important; text-indent: 0 !important; font-style: italic; font-size: 1.3em; margin: 1.5em 0 !important; }

    /* === CAPITULAR === */
    span.drop-cap { float: left; font-size: 2.5em; line-height: 0.75; margin: 0.05em 0.08em 0 0; font-weight: bold; }
    p.drop-cap { text-indent: 0 !important; }
    p.drop-cap::first-letter { float: left; font-size: 2.5em; line-height: 0.75; margin: 0.05em 0.08em 0 0; font-weight: bold; }

    .alinea { margin-left: 80px; text-indent: 0 !important; }

    /* Listas (bullets) — espaçamento entre itens à imagem do corpo */
    ul, ol { margin: 0.5em 0; padding-left: 3em; }
    li { line-height: 2.0em; margin-bottom: 0.5em; text-align: justify; }

    /* === BORDAS === */
    .p-border-top    { border-top: 2px solid #555; padding-top: 0.6em; margin-top: 0.6em; text-indent: 0 !important; }
    .p-border-bottom { border-bottom: 2px solid #555; padding-bottom: 0.6em; margin-bottom: 0.6em; text-indent: 0 !important; }
    .p-border-sides  { border-left: 2px solid #333; border-right: 2px solid #888; padding-left: 0.6em; padding-right: 0.6em; text-indent: 0 !important; }

    /* === CAIXAS === */
    .box { border: 2px solid #000; padding: 0.8em 1em; margin: 1em 0; }

    /* === QUEBRAS === */
    .noBreak { page-break-inside: avoid; break-inside: avoid; }

    .p-small { font-size: 0.85em !important; }
    .p-legendas { font-size: 0.85em !important; margin-bottom: 30px !important; text-indent: 0 !important; }

    /* === TABELAS === */
    table { border-collapse: collapse; margin: 1em 0; font-size: 0.85em; width: 100%; table-layout: fixed; }
    table th, table td { border: 1px solid #333; padding: 4px 8px; text-align: center; vertical-align: middle; word-wrap: break-word; overflow-wrap: break-word; }
    table th { font-weight: bold; }

    /* === NOTAS DE RODAPÉ === */
    .footnote p { text-indent: 0 !important; margin: 0; }
    .footnote {
        text-indent: 0 !important;
        font-size: 0.9em;
        margin-top: 0.6em;
        text-align: left;
        display: block;
        hyphens: none;
        color: red;
    }

    .footnotes-section {
        margin-top: 3em;
        border-top: 1px solid #ccc;
        padding-top: 1em;
    }

    sup {
        font-size: 0.75em;
        vertical-align: super;
        line-height: 0;
    }

    sup a, .footnote a { text-decoration: none; }

    .small-caps { font-variant: small-caps; }

    img {
        max-width: 100%;
        height: auto;
        margin: 1.5em auto;
        display: block;
    }

    img.img-center { display: block; float: none; margin: 1.5em auto; }
    img.img-left { float: left; margin: 0.5em 1.5em 0.5em 0; }
    img.img-right { float: right; margin: 0.5em 0 0.5em 1.5em; }

    /* === EDITOR (não exportado para EPUB) === */
    [data-mce-psactive] {
        box-shadow: inset 0 0 0 2px #475569;
        border-radius: 2px;
        padding: 5px 8px;
        margin-left: -8px;
        margin-right: -8px;
    }
    hr.chapter-break {
        border: 0;
        border-top: 2px dashed #2563eb;
        margin: 3em 0;
        position: relative;
    }
    hr.chapter-break::after {
        content: "QUEBRA DE CAPÍTULO";
        position: absolute;
        top: -10px;
        left: 50%;
        transform: translateX(-50%);
        padding: 0 10px;
        font-size: 10px;
        font-weight: bold;
        color: #2563eb;
    }
    p.chapter-break, p.chapter-break-h1, p.chapter-break-h2 {
        border: 0;
        border-top: 2px dashed #374151;
        margin: 3em 0 0;
        padding-bottom: 1.5em;
        height: 0;
        position: relative;
    }
    p.chapter-break::after, p.chapter-break-h1::after, p.chapter-break-h2::after {
        content: attr(data-title);
        position: absolute;
        top: -10px;
        left: 50%;
        transform: translateX(-50%);
        padding: 0 10px;
        font-size: 10px;
        font-weight: bold;
        color: #374151;
        white-space: nowrap;
    }
    span.pagebreak {
        position: absolute;
        right: 4px;
        user-select: none;
        pointer-events: none;
    }
    span.pagebreak::before {
        content: attr(data-page);
        font-size: 0.7em;
        font-weight: 600;
        color: #94a3b8;
    }
    .grammar-error-highlight {
        text-decoration: underline wavy #ef4444 2px;
        background-color: rgba(239, 68, 68, 0.1);
        cursor: help;
    }
    .highlight-pulse { animation: pulse-bg 2s; }
    @keyframes pulse-bg {
        0%   { background-color: rgba(255, 255, 0, 0); }
        20%  { background-color: rgba(255, 255, 0, 0.5); }
        100% { background-color: rgba(255, 255, 0, 0); }
    }
`;

const MISSING_PARAGRAPH_STYLES = `    .p-bold       { font-weight: bold !important; }
    .p-italic     { font-style: italic !important; }
    .p-bold-italic { font-weight: bold !important; font-style: italic !important; }
`;

/** Insere estilos de parágrafo em falta no style.css guardado (livros anteriores a p-italic). */
export function patchLoadedCss(css: string): string {
  // Marcador de capítulo: retirar o prefixo "Capítulo - " (livros antigos guardaram-no no CSS).
  css = css.replace(/content:\s*"Cap[íi]tulo - "\s+attr\(data-title\)/g, 'content: attr(data-title)');
  if (css.includes('.p-italic')) return css;
  const marker = '/* === ESTILOS DE PARÁGRAFO === */';
  const idx = css.indexOf(marker);
  if (idx !== -1) {
    const lineEnd = css.indexOf('\n', idx);
    const insertAt = lineEnd === -1 ? css.length : lineEnd + 1;
    return css.slice(0, insertAt) + MISSING_PARAGRAPH_STYLES + '\n' + css.slice(insertAt);
  }
  return `${css.trimEnd()}\n\n${MISSING_PARAGRAPH_STYLES}`;
}

interface StyleContextType {
  customCss: string;
  tempCss: string | null;
  setCustomCss: (css: string) => void;
  setTempCss: (css: string | null) => void;
  resetToDefaults: () => void;
  getCurrentCss: () => string;
}

const StyleContext = createContext<StyleContextType | undefined>(undefined);

export const StyleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customCss, setCustomCss] = useState<string>(DEFAULT_CSS);
  const [tempCss, setTempCss] = useState<string | null>(null);

  const resetToDefaults = () => {
    setCustomCss(DEFAULT_CSS);
    setTempCss(null);
  };

  const getCurrentCss = () => tempCss !== null ? tempCss : customCss;

  return (
    <StyleContext.Provider value={{ customCss, tempCss, setCustomCss, setTempCss, resetToDefaults, getCurrentCss }}>
      {children}
    </StyleContext.Provider>
  );
};

export const useStyles = () => {
  const context = useContext(StyleContext);
  if (!context) {
    throw new Error('useStyles must be used within a StyleProvider');
  }
  return context;
};
