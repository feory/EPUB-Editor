// Estilos FIXOS de bloco do editor (classes do livro). Única fonte: o registo de formatos do TinyMCE (formats.ts), o menu
// "Estilos" da barra, o menu "Mais estilos" e o painel do bloco derivam daqui (config.ts). Acrescentar um estilo = uma linha.

export interface BlockStyle {
    format: string;      // nome do formato = classe CSS (box é wrapper: não é classe do próprio bloco)
    label: string;       // menu "Mais estilos" e painel do bloco
    toolbar?: string;    // rótulo no menu "Estilos" da barra, se diferente de `label`
    group: 'paragraph' | 'border' | 'special';  // grupo no menu "Estilos" da barra
    more: 'paragraph' | 'other' | null;         // "Mais estilos": junto dos parágrafos (blocos-título) ou dos restantes; null = só na barra
}

export const BLOCK_STYLES: readonly BlockStyle[] = [
    { format: 'p-indent', label: 'Com Indentação', group: 'paragraph', more: 'paragraph' },
    { format: 'p-top', label: 'Topo', group: 'paragraph', more: 'paragraph' },
    { format: 'p-space', label: 'Espaço Extra', group: 'paragraph', more: 'paragraph' },
    { format: 'p-small', label: 'Texto Pequeno', group: 'paragraph', more: 'paragraph' },
    { format: 'p-quote', label: 'Citação', group: 'paragraph', more: 'paragraph' },
    { format: 'p-bold', label: 'Negrito', group: 'paragraph', more: 'paragraph' },
    { format: 'p-italic', label: 'Itálico', group: 'paragraph', more: 'paragraph' },
    { format: 'p-bold-italic', label: 'Negrito + Itálico', group: 'paragraph', more: 'paragraph' },
    { format: 'p-uppercase', label: 'Maiúsculas', group: 'paragraph', more: 'paragraph' },
    { format: 'p-legendas', label: 'Legenda', group: 'paragraph', more: 'paragraph' },
    { format: 'p-asterisk', label: 'Separador (*)', group: 'paragraph', more: null },
    { format: 'p-border-top', label: 'Borda Superior', group: 'border', more: 'other' },
    { format: 'p-border-bottom', label: 'Borda Inferior', group: 'border', more: 'other' },
    { format: 'p-border-sides', label: 'Borda Lateral', group: 'border', more: 'other' },
    { format: 'drop-cap', label: 'Capitular', toolbar: 'Capitular (Drop Cap)', group: 'special', more: 'other' },
    { format: 'footnote', label: 'Nota de Rodapé', group: 'special', more: 'other' },
    { format: 'box', label: 'Box', group: 'special', more: 'other' },
];

/** Estilos que são uma classe do próprio bloco (tudo menos o wrapper `box`). */
export const BLOCK_CLASS_STYLES = BLOCK_STYLES.filter((s) => s.format !== 'box');
