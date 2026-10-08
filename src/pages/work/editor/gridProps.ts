// Bloco de colunas: <div class="columns"><div class="col">…</div><div class="col">…</div></div>.
// Proporção = grid-template-columns inline; espaço = gap inline. '' / null = herda do CSS do livro (1fr 1fr).

export const COLUMN_RATIOS = [['', '50 / 50'], ['1fr 2fr', '33 / 67'], ['2fr 1fr', '67 / 33'], ['1fr 3fr', '25 / 75'], ['3fr 1fr', '75 / 25']] as const;
export type ColumnRatio = typeof COLUMN_RATIOS[number][0];

export interface ColumnsProps {
    ratio: ColumnRatio;
    gap: number | null; // em
}

export const EMPTY_COLUMNS: ColumnsProps = { ratio: '', gap: null };

export interface ColumnsDom { setStyle(el: HTMLElement, name: string, value: string | null): void }

export function readColumnsProps(el: HTMLElement): ColumnsProps {
    const ratio = el.style.gridTemplateColumns.trim();
    return {
        ratio: COLUMN_RATIOS.some(([r]) => r === ratio) ? (ratio as ColumnRatio) : '',
        gap: el.style.gap ? parseFloat(el.style.gap) : null,
    };
}

export function applyColumnsProps(dom: ColumnsDom, el: HTMLElement, patch: Partial<ColumnsProps>): void {
    if ('ratio' in patch) dom.setStyle(el, 'grid-template-columns', patch.ratio || null);
    if ('gap' in patch) dom.setStyle(el, 'gap', patch.gap == null ? null : `${patch.gap}em`);
}
