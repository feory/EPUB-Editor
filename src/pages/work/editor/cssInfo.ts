// Texto da barra de estado do editor: o seletor e o style inline do bloco sob o cursor e, se o cursor está dentro de elementos em
// linha (um <span style="…">, <em>…), a cadeia até ao cursor — é aí que está o "código inline" do texto.
//   h1 > span { background: #000; color: #fff; }

const describe = (el: Element): string => {
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter((c) => c && !c.startsWith('mce') && !c.startsWith('data-mce')).map((c) => `.${c}`).join('');
    const style = (el.getAttribute('style') || '').trim();
    return el.nodeName.toLowerCase() + cls + (style ? ` { ${style} }` : '');
};

/** `block` = o parágrafo/título; `node` = o elemento sob o cursor (o próprio bloco, ou um descendente em linha). */
export function blockCssInfo(block: Element, node: Element): string {
    const inline: string[] = [];
    for (let el: Element | null = node; el && el !== block; el = el.parentElement) inline.unshift(describe(el));
    return [describe(block), ...inline].join(' > ');
}
