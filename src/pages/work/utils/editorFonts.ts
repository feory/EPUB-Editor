// Fontes só do EDITOR — preview de leitura. NUNCA exportadas para o EPUB
// (injetadas num bloco de estilo à parte do customCss/style.css do livro).
// ponytail: fontes variáveis (1 ttf cobre 400–700) servidas de /editor-fonts em 'self'.

export interface EditorFont {
  id: string;
  label: string;
  stack: string;
}

// id 'default' = a fonte do próprio style.css do livro (sem override = Crimson Text).
export const EDITOR_FONTS: EditorFont[] = [
  { id: 'default', label: 'Crimson Text', stack: '' },
  { id: 'lora', label: 'Lora', stack: '"Lora", Georgia, serif' },
  { id: 'ebgaramond', label: 'EB Garamond', stack: '"EB Garamond", Georgia, serif' },
  { id: 'sourceserif', label: 'Source Serif 4', stack: '"Source Serif 4", Georgia, serif' },
];

// @font-face das fontes embutidas (caminho absoluto servido em 'self').
const FONT_FACES = `
@font-face { font-family: "Lora"; src: url("/editor-fonts/Lora.ttf"); font-weight: 400 700; font-style: normal; }
@font-face { font-family: "Lora"; src: url("/editor-fonts/Lora-Italic.ttf"); font-weight: 400 700; font-style: italic; }
@font-face { font-family: "EB Garamond"; src: url("/editor-fonts/EBGaramond.ttf"); font-weight: 400 700; font-style: normal; }
@font-face { font-family: "EB Garamond"; src: url("/editor-fonts/EBGaramond-Italic.ttf"); font-weight: 400 700; font-style: italic; }
@font-face { font-family: "Source Serif 4"; src: url("/editor-fonts/SourceSerif4.ttf"); font-weight: 400 700; font-style: normal; }
@font-face { font-family: "Source Serif 4"; src: url("/editor-fonts/SourceSerif4-Italic.ttf"); font-weight: 400 700; font-style: italic; }
`;

export interface EditorFontSize {
  id: string;
  label: string;
  value: string; // font-size do body; '' = sem override (tamanho do style.css)
}

// id 'default' = tamanho do style.css do livro (sem override).
export const EDITOR_FONT_SIZES: EditorFontSize[] = [
  { id: 'default', label: 'Padrão', value: '' },
  { id: 'sm', label: 'Pequeno', value: '0.95em' },
  { id: 'md', label: 'Médio', value: '1.1em' },
  { id: 'lg', label: 'Grande', value: '1.3em' },
  { id: 'xl', label: 'Muito grande', value: '1.5em' },
];

const STORAGE_KEY = 'epub-editor-font';
const SIZE_STORAGE_KEY = 'epub-editor-font-size';

export const getStoredFont = (): string => localStorage.getItem(STORAGE_KEY) || 'default';
export const storeFont = (id: string) => localStorage.setItem(STORAGE_KEY, id);

export const getStoredFontSize = (): string => localStorage.getItem(SIZE_STORAGE_KEY) || 'default';
export const storeFontSize = (id: string) => localStorage.setItem(SIZE_STORAGE_KEY, id);

// CSS editor-only: @font-face + override do body (família e tamanho) conforme a escolha.
export function editorFontCss(fontId: string, sizeId = 'default'): string {
  const font = EDITOR_FONTS.find(f => f.id === fontId);
  const size = EDITOR_FONT_SIZES.find(s => s.id === sizeId);
  const decls = [
    font?.stack ? `font-family: ${font.stack} !important;` : '',
    size?.value ? `font-size: ${size.value} !important;` : '',
  ].filter(Boolean).join(' ');
  return decls ? `${FONT_FACES}\nbody { ${decls} }` : FONT_FACES;
}
