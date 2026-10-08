import type { BoxBorderStyle } from './boxProps';

// Grelha: <div class="grid"> com células por filho direto — uma coluna (div.col com blocos), um parágrafo
// ou uma imagem (num parágrafo). Nasce vazia; o "+" interno acrescenta células.
// Proporção = grid-template-columns inline; espaço = gap inline. '' / null = herda do CSS do livro (1fr 1fr).

export const GRID_RATIOS = [['', '50 / 50'], ['1fr 2fr', '33 / 67'], ['2fr 1fr', '67 / 33'], ['1fr 3fr', '25 / 75'], ['3fr 1fr', '75 / 25'], ['1fr 1fr 1fr', '3 iguais'], ['1fr 1fr 1fr 1fr', '4 iguais']] as const;
export type GridRatio = typeof GRID_RATIOS[number][0];

export interface GridProps {
    ratio: GridRatio;
    gap: number | null;           // em
    background: string;
    borderColor: string;
    borderWidth: number | null;   // px
    borderStyle: BoxBorderStyle;
    radius: number | null;        // px
    padding: number | null;       // em
}

export const EMPTY_GRID: GridProps = { ratio: '', gap: null, background: '', borderColor: '', borderWidth: null, borderStyle: '', radius: null, padding: null };

export interface GridDom { setStyle(el: HTMLElement, name: string, value: string | null): void }

const num = (v: string) => (v ? parseFloat(v) : null);
const unit = (v: number | null | undefined, u: string) => (v == null ? null : `${v}${u}`);

export function readGridProps(el: HTMLElement): GridProps {
    const ratio = el.style.gridTemplateColumns.trim();
    const s = el.style;
    return {
        ratio: GRID_RATIOS.some(([r]) => r === ratio) ? (ratio as GridRatio) : '',
        gap: num(s.gap),
        background: s.backgroundColor,
        borderColor: s.borderColor,
        borderWidth: num(s.borderWidth),
        borderStyle: (s.borderStyle as BoxBorderStyle) || '',
        radius: num(s.borderRadius),
        padding: num(s.padding),
    };
}

export function applyGridProps(dom: GridDom, el: HTMLElement, patch: Partial<GridProps>): void {
    const set = (name: string, value: string | null | undefined) => dom.setStyle(el, name, value || null);
    if ('ratio' in patch) set('grid-template-columns', patch.ratio);
    if ('gap' in patch) set('gap', unit(patch.gap, 'em'));
    if ('background' in patch) set('background-color', patch.background);
    if ('borderColor' in patch) set('border-color', patch.borderColor);
    if ('borderWidth' in patch) set('border-width', unit(patch.borderWidth, 'px'));
    if ('borderStyle' in patch) set('border-style', patch.borderStyle);
    if ('radius' in patch) set('border-radius', unit(patch.radius, 'px'));
    if ('padding' in patch) set('padding', unit(patch.padding, 'em'));
}

const CELL_STYLES = ['border-color', 'border-width', 'border-style', 'border-radius', 'background-color'] as const;

/** "Aplicar às células": copia contorno, cantos e fundo da grelha para cada célula (coluna, parágrafo…). */
export function applyGridToCells(dom: GridDom, grid: HTMLElement): void {
    for (const cell of Array.from(grid.children).filter((c) => c.nodeName !== 'BR') as HTMLElement[]) {
        for (const name of CELL_STYLES) dom.setStyle(cell, name, grid.style.getPropertyValue(name) || null);
    }
}

export type GridCellKind = 'col' | 'text' | 'image';

/** A célula (filho direto da grelha) que contém o nó, se estiver dentro da grelha. */
export function cellOf(grid: Element, node: Node): Element | null {
    let cur: Node | null = node;
    while (cur && cur.parentNode !== grid) cur = cur.parentNode;
    return cur && cur.nodeType === 1 ? (cur as Element) : null;
}

/** Sem células (um <br> de preenchimento do TinyMCE não conta). */
export const isGridEmpty = (grid: Element): boolean => Array.from(grid.children).every((c) => c.nodeName === 'BR');

/**
 * Acrescenta uma célula depois de `after` (ou no fim) e devolve o parágrafo onde pôr o cursor.
 * 'image' é um parágrafo vazio: quem chama abre o diálogo de imagem a seguir.
 */
export function addGridCell(grid: Element, kind: GridCellKind, after: Element | null): Element {
    grid.querySelectorAll(':scope > br').forEach((br) => br.remove());
    const doc = grid.ownerDocument;
    const p = doc.createElement('p');
    p.innerHTML = '<br data-mce-bogus="1">';
    let cell: Element = p;
    if (kind === 'col') { cell = doc.createElement('div'); cell.className = 'col'; cell.append(p); }
    if (after) after.after(cell); else grid.append(cell);
    return p;
}
