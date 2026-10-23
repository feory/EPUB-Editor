// Edição de bloco: único module que sabe o que está sob o cursor (caixa, bloco de texto, imagem,
// colunas), como o ler (inspect) e como o alterar (apply). O painel lateral só conhece este interface.
// Os módulos *Props são a implementação: leitura/escrita pura por alvo.

import { readBoxProps, applyBoxProps, type BoxProps } from './boxProps';
import { textPropsFrom, applyTextProps, type TextProps, type TextBlockInfo } from './textProps';
import { readImageProps, applyImageProps, type ImageProps } from './imageProps';
import { readGridProps, applyGridProps, applyGridToCells, type GridProps } from './gridProps';
import { readSelectionProps, selectionPatchOps, type SelectionProps } from './selectionProps';
import { BLOCK_STYLE_OPTIONS } from './config';

/** Seletor dos blocos de texto editáveis (parágrafo, títulos, item de lista). */
export const TEXT_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li';

/** O que o painel mostra: cada campo é null quando o cursor não está nesse alvo. */
export interface BlockInfo {
    box: BoxProps | null;
    text: TextBlockInfo | null;
    image: ImageProps | null;       // imagem selecionada
    grid: GridProps | null;   // bloco .grid à volta do cursor
    selection: SelectionProps | null; // caracteres selecionados num bloco de texto (null com o cursor recolhido)
}

export type BlockEdit =
    | { target: 'box'; patch: Partial<BoxProps> }
    | { target: 'selection'; patch: Partial<SelectionProps> } // span inline à volta da seleção
    | { target: 'text'; patch: Partial<TextProps> }   // style inline do bloco ("Este bloco")
    | { target: 'image'; patch: Partial<ImageProps> }
    | { target: 'grid'; patch: Partial<GridProps> }
    | { target: 'gridCells' }                          // copia contorno/fundo da grelha às suas células
    | { target: 'class'; cls: string; on: boolean }   // liga/desliga UM estilo de parágrafo (combinável com outros)
    | { target: 'style'; format: string };            // troca o estilo (Título 1-3, Padrão, Citação…)

/** O que o module pede ao editor (seam). Adapters: TinyMCE (produção) e um fake em memória (testes). */
export interface EditorLike {
    selectionNode(): Node;
    /** Caixa ou grelha selecionada pelo clique na sua área (o cursor pode estar fora dela). */
    selectedContainer?(): HTMLElement | null;
    closest(node: Node, selector: string): HTMLElement | null;
    setStyle(el: HTMLElement, name: string, value: string | null): void;
    /** Style com !important: as classes de parágrafo do livro (.p-center…) usam-no e o inline não as vencia. */
    setImportantStyle(el: HTMLElement, name: string, value: string | null): void;
    setAttrib(el: HTMLElement, name: string, value: string | null): void;
    addClass(el: HTMLElement, cls: string): void;
    removeClass(el: HTMLElement, cls: string): void;
    /** Um passo de undo + reavaliação do cursor (painel, mini-menu). */
    transact(mutate: () => void): void;
    formatBlock(tag: string): void;
    applyFormat(format: string): void;
    /** Há texto selecionado (não só cursor)? `read` lê um valor CSS inline dos spans que o rodeiam (não do bloco). */
    selectedText?(): { read(cssName: string): string } | null;
    /** Aplica (value) ou tira (null) um formato inline por propriedade na seleção. */
    applyInline?(format: string, value: string | null): void;
}

/** Caixa/grelha alvo: a selecionada pelo clique na sua área, senão a que rodeia o cursor. */
function containerTarget(ed: EditorLike, node: Node, selector: '.box' | '.grid'): HTMLElement | null {
    const sel = ed.selectedContainer?.();
    return sel?.matches(selector) ? sel : ed.closest(node, selector);
}

export function inspectBlock(ed: EditorLike): BlockInfo {
    const node = ed.selectionNode();
    const box = containerTarget(ed, node, '.box');
    const grid = containerTarget(ed, node, '.grid');
    const el = ed.closest(node, TEXT_BLOCK_SELECTOR);
    const isText = !!el && !/(^|\s)chapter-break/.test(el.className);
    return {
        box: box ? readBoxProps(box) : null,
        grid: grid ? readGridProps(grid) : null,
        image: node.nodeName === 'IMG' ? readImageProps(node as HTMLElement) : null,
        selection: isText && ed.selectedText ? ((sel) => (sel ? readSelectionProps(sel.read) : null))(ed.selectedText()) : null,
        text: isText ? {
            tag: el.nodeName.toLowerCase(),
            classes: Array.from(el.classList).filter((c) => !/^(mce-|diff-)/.test(c)),
            inline: textPropsFrom((n) => el.style.getPropertyValue(n)),
        } : null,
    };
}

export function applyBlockEdit(ed: EditorLike, edit: BlockEdit): void {
    const node = ed.selectionNode();
    switch (edit.target) {
        case 'box': {
            const box = containerTarget(ed, node, '.box');
            if (box) ed.transact(() => applyBoxProps(ed, box, edit.patch));
            return;
        }
        case 'grid': {
            const grid = containerTarget(ed, node, '.grid');
            if (grid) ed.transact(() => applyGridProps(ed, grid, edit.patch));
            return;
        }
        case 'gridCells': {
            const grid = containerTarget(ed, node, '.grid');
            if (grid) ed.transact(() => applyGridToCells(ed, grid));
            return;
        }
        case 'image':
            if (node.nodeName === 'IMG') ed.transact(() => applyImageProps(ed, node as HTMLElement, edit.patch));
            return;
        case 'selection': {
            if (ed.selectedText?.() && ed.applyInline) ed.transact(() => selectionPatchOps(edit.patch).forEach((op) => ed.applyInline!(op.format, op.value)));
            return;
        }
        case 'text': {
            const el = ed.closest(node, TEXT_BLOCK_SELECTOR);
            if (el) ed.transact(() => applyTextProps({ setStyle: (e, n, v) => ed.setImportantStyle(e, n, v) }, el, edit.patch));
            return;
        }
        case 'class': {
            const el = ed.closest(node, TEXT_BLOCK_SELECTOR);
            if (el) ed.transact(() => (edit.on ? ed.addClass(el, edit.cls) : ed.removeClass(el, edit.cls)));
            return;
        }
        case 'style':
            applyStyle(ed, edit.format);
    }
}

function applyStyle(ed: EditorLike, format: string): void {
    const el = ed.closest(ed.selectionNode(), TEXT_BLOCK_SELECTOR);
    if (!el) return;
    ed.transact(() => {
        // Estilo = exclusivo: tira os outros estilos de parágrafo antes de aplicar o novo.
        BLOCK_STYLE_OPTIONS.forEach(([f]) => !/^(h[1-3]|p)$/.test(f) && ed.removeClass(el, f));
        const tag = el.nodeName.toLowerCase();
        if (/^h[123]$/.test(format)) {
            if (tag !== format) ed.formatBlock(format);
            return;
        }
        if (/^h[1-6]$/.test(tag)) ed.formatBlock('p'); // classes de parágrafo não casam em títulos
        if (format !== 'p') ed.applyFormat(format);
    });
}

/** Chama onChange(info) a cada update(), mas só quando a informação mudou (ligar ao NodeChange). */
export function createBlockWatcher(ed: EditorLike, onChange: (info: BlockInfo) => void) {
    let last = '';
    return {
        update() {
            const info = inspectBlock(ed);
            const json = JSON.stringify(info);
            if (json === last) return;
            last = json;
            onChange(info);
        },
    };
}
