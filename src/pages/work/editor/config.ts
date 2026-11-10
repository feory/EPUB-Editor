// Dados estáticos da configuração do TinyMCE (sem referência ao `editor`).
import { BLOCK_STYLES, type BlockStyle } from './blockStyles';

export const EDITOR_PLUGINS = [
    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap',
    'preview', 'anchor', 'searchreplace', 'visualblocks', 'code',
    'fullscreen', 'insertdatetime', 'media', 'table', 'quickbars',
];

// Bubble de formatação na seleção de texto (só selection; sem barras de inserção/imagem).
export const QUICKBARS_SELECTION_TOOLBAR = 'bold italic underline superscript casemenu edittext | link | addcomment';

export const EDITOR_TOOLBAR =
    'undo redo | styles removeformat | ' +
    'align outdent indent bullist numlist | ' +
    'box noBreak | link image charmap code | pintoolbar pdfview focusmode';

const toolbarItems = (group: BlockStyle['group']) => BLOCK_STYLES.filter((s) => s.group === group).map((s) => ({ title: s.toolbar ?? s.label, format: s.format }));
// "Unido" fica fora de propósito: o menu Styles aplica via editor.formatter nativo, que funde vários <p> selecionados num só
// bloco. O botão da toolbar (ps-union, setup.ts) faz o wrap manualmente (sem esse bug) — é o único caminho para "noBreak".
export const STYLE_FORMATS = [
    { title: 'Títulos', items: [
        { title: 'Título 1', format: 'h1' },
        { title: 'Título 2', format: 'h2' },
        { title: 'Título 3', format: 'h3' },
    ]},
    { title: 'Parágrafos', items: [{ title: 'Padrão', format: 'p' }, ...toolbarItems('paragraph')] },
    { title: 'Bordas', items: toolbarItems('border') },
    { title: 'Especial', items: toolbarItems('special') },
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
const moreStyles = (more: BlockStyle['more']) => BLOCK_STYLES.filter((s) => s.more === more).map((s) => [s.format, s.label] as const);
const PARAGRAPH_STYLES = [['p', 'Padrão'] as const, ...moreStyles('paragraph')];
const OTHER_STYLES = moreStyles('other');
export const MORE_STYLES_PARA: ReadonlyArray<readonly [string, string]> = [...HEADING_STYLES, ...OTHER_STYLES];
export const MORE_STYLES_HEAD: ReadonlyArray<readonly [string, string]> = [...PARAGRAPH_STYLES, ...OTHER_STYLES];

// STYLE_FORMATS com os estilos personalizados do livro (classes) no fim de "Parágrafos".
export const styleFormatsWith = (custom: string[]) => STYLE_FORMATS.map((group) =>
    group.title === 'Parágrafos' ? { ...group, items: [...group.items, ...custom.map((c) => ({ title: c, format: c }))] } : group);

// Estilos mutuamente exclusivos do seletor "Estilo" do painel de bloco (títulos + parágrafo + bordas + nota de rodapé + capitular).
export const BLOCK_STYLE_OPTIONS: ReadonlyArray<readonly [string, string]> = [
    ...HEADING_STYLES, ...PARAGRAPH_STYLES, ...OTHER_STYLES.filter(([f]) => f !== 'box'), // box é um wrapper (div), não um estilo do próprio bloco
];

// Botão ¶ "Estilo do parágrafo" do mini-menu (ver mini-menu 'parastyles' em setup.ts) — subconjunto
// reordenado de PARAGRAPH_STYLES (labels vêm de lá, fonte única).
const QUICK_STYLE_ORDER = ['p', 'p-indent', 'p-small', 'p-legendas', 'p-bold', 'p-italic', 'p-bold-italic', 'p-quote'] as const;
export const PARAGRAPH_QUICK_STYLES: ReadonlyArray<readonly [string, string]> =
    QUICK_STYLE_ORDER.map(format => PARAGRAPH_STYLES.find(([f]) => f === format)!);

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
    { value: 'anchor', text: 'Âncora (ligar ao Índice)', icon: 'bookmark' },
];
