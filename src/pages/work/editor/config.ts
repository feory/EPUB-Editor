// Dados estáticos da configuração do TinyMCE (sem referência ao `editor`).

export const EDITOR_PLUGINS = [
    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
    'preview', 'anchor', 'searchreplace', 'visualblocks', 'code',
    'fullscreen', 'insertdatetime', 'media', 'table', 'quickbars',
];

// Bubble de formatação na seleção de texto (só selection; sem barras de inserção/imagem).
export const QUICKBARS_SELECTION_TOOLBAR = 'bold italic superscript smallcaps smalltext | link';

export const EDITOR_TOOLBAR =
    'undo redo | styles removeformat | ' +
    'align outdent indent bullist numlist | ' +
    'chapterbreak box noBreak | link image charmap code';

export const STYLE_FORMATS = [
    { title: 'Títulos', items: [
        { title: 'Título 1', format: 'h1' },
        { title: 'Título 2', format: 'h2' },
        { title: 'Título 3', format: 'h3' },
    ]},
    { title: 'Parágrafos', items: [
        { title: 'Padrão', format: 'p' },
        { title: 'Com Indentação', format: 'p-indent' },
        { title: 'Topo', format: 'p-top' },
        { title: 'Espaço Extra', format: 'p-space' },
        { title: 'Texto Pequeno', format: 'p-small' },
        { title: 'Legenda', format: 'p-legendas' },
        { title: 'Negrito', format: 'p-bold' },
        { title: 'Itálico', format: 'p-italic' },
        { title: 'Negrito + Itálico', format: 'p-bold-italic' },
        { title: 'Citação', format: 'p-quote' },
    ]},
    { title: 'Bordas', items: [
        { title: 'Borda Superior', format: 'p-border-top' },
        { title: 'Borda Inferior', format: 'p-border-bottom' },
        { title: 'Borda Lateral', format: 'p-border-sides' },
    ]},
    { title: 'Especial', items: [
        { title: 'Capitular (Drop Cap)', format: 'drop-cap' },
        { title: 'Nota de Rodapé', format: 'footnote' },
        { title: 'Box', format: 'box' },
        { title: 'Unido', format: 'noBreak' },
    ]},
];

export const TEXT_PATTERNS = [
    { start: '*', end: '*', format: 'italic' },
    { start: '**', end: '**', format: 'bold' },
    { start: '#', format: 'h1' },
    { start: '##', format: 'h2' },
    { start: '###', format: 'h3' },
    { start: '* ', cmd: 'InsertUnorderedList' },
    { start: '- ', cmd: 'InsertUnorderedList' },
    { start: '---', replacement: '<hr>' }, // divisória
];

// "Mais estilos" (botão ⋮ do mini-menu): estilos secundários mostrados em 2 colunas
// num overlay React. Bloco parágrafo → oferece títulos + outros; bloco título → parágrafos + outros.
const HEADING_STYLES = [['h1', 'Título 1'], ['h2', 'Título 2'], ['h3', 'Título 3']] as const;
const PARAGRAPH_STYLES = [
    ['p', 'Padrão'], ['p-indent', 'Com Indentação'], ['p-top', 'Topo'],
    ['p-space', 'Espaço Extra'], ['p-quote', 'Citação'],
    ['p-italic', 'Itálico'], ['p-bold-italic', 'Negrito + Itálico'], ['p-legendas', 'Legenda'],
] as const;
const OTHER_STYLES = [
    ['p-border-top', 'Borda Superior'], ['p-border-bottom', 'Borda Inferior'],
    ['p-border-sides', 'Borda Lateral'], ['drop-cap', 'Capitular'],
    ['footnote', 'Nota de Rodapé'], ['box', 'Box'],
] as const;
export const MORE_STYLES_PARA: ReadonlyArray<readonly [string, string]> = [...HEADING_STYLES, ...OTHER_STYLES];
export const MORE_STYLES_HEAD: ReadonlyArray<readonly [string, string]> = [...PARAGRAPH_STYLES, ...OTHER_STYLES];

// Menu "/" (estilo Notion): escrever "/" abre lista p/ inserir/converter bloco.
export const SLASH_ITEMS = [
    { value: 'h1', text: 'Título 1', icon: 'ps-h1' },
    { value: 'h2', text: 'Título 2', icon: 'ps-h2' },
    { value: 'h3', text: 'Título 3', icon: 'ps-h3' },
    { value: 'p', text: 'Parágrafo', icon: 'ps-default' },
    { value: 'p-quote', text: 'Citação', icon: 'ps-quote' },
    { value: 'p-small', text: 'Texto pequeno', icon: 'ps-small' },
    { value: 'footnote', text: 'Nota de rodapé', icon: 'ps-smalltext' },
    { value: 'image', text: 'Imagem', icon: 'image' },
    { value: 'hr', text: 'Divisória', icon: 'horizontal-rule' },
];
