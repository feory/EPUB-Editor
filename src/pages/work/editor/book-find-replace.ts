import type { TinyMCEEditor } from './types';
import { CHAPTER_SPLIT_PATTERN, countOccurrences } from '../../../utils/html-cleaner';

// Aplica o novo HTML do body + regista undo + volta a mostrar o bloco que estava a ser
// editado (índice entre os filhos de topo — sobrevive à troca porque replace de texto não
// adiciona/remove blocos de topo). Partilhado pelos 2 ramos de replaceInBook que escrevem
// localmente no editor (scope 'chapter').
const commitBodyHtml = (editor: TinyMCEEditor, body: HTMLElement, newBodyHtml: string, anchorBlock: HTMLElement | null) => {
    const anchorIndex = anchorBlock ? Array.from(body.children).indexOf(anchorBlock) : -1;
    editor.dom.setHTML(body, newBodyHtml);
    editor.undoManager.add();
    editor.focus();
    editor.dispatch('Change');
    editor.nodeChanged();
    if (anchorIndex >= 0) {
        (body.children[anchorIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'center' });
    }
};

// Contagem de ocorrências (só leitura) — usada pelo mini find/replace para mostrar "N
// ocorrências" ANTES de aplicar (BlockOverlays, debounced). scope 'document' com só um
// capítulo carregado no editor: o resto do livro nem está na DOM, conta por fora
// (onCountInWholeBook, ver useEbookWork.countInWholeBook).
export function countInBook(
    editor: TinyMCEEditor | null,
    activeChapterIndex: number,
    onCountInWholeBook: (find: string) => number,
    find: string,
    scope: 'chapter' | 'document',
): number {
    if (!find) return 0;
    if (scope === 'document' && activeChapterIndex !== -1) return onCountInWholeBook(find);
    return countOccurrences(editor?.getContent() ?? '', find);
}

// Substituição literal (todas as ocorrências), acionada a partir do mini find/replace da
// caixa de edição de HTML (BlockOverlays) — devolve o nº de ocorrências trocadas.
// split/join em vez de RegExp: sem escaping de caracteres especiais para uma substring
// literal. dom.setHTML(getBody()) em vez de editor.setContent(): setContent() LIMPA a
// pilha de undo inteira (pensado para carregar conteúdo pela 1ª vez, não para editar) —
// testado ao vivo, ficava sempre sem Ctrl+Z possível mesmo com undoManager.add()/
// transact() a seguir. dom.setHTML + add() cria 1 nível normal.
export function replaceInBook(
    editor: TinyMCEEditor | null,
    activeChapterIndex: number,
    onReplaceInWholeBook: (find: string, replaceWith: string) => number,
    anchorBlock: HTMLElement | null,
    find: string,
    replaceWith: string,
    scope: 'chapter' | 'document',
): number {
    if (!editor || !find) return 0;

    // 'document' com só um capítulo carregado: o resto do livro nem está na DOM — grava
    // por fora do editor (onReplaceInWholeBook → useEbookWork.handleReplaceInWholeBook,
    // mesmo caminho das outras transformações de livro inteiro: commitHtml + autosave). O
    // editor re-sincroniza sozinho a seguir (prop `value` controlada do TinyMCE); sem
    // bloco-âncora local para voltar (o texto trocado pode nem estar no capítulo aberto).
    if (scope === 'document' && activeChapterIndex !== -1) return onReplaceInWholeBook(find, replaceWith);

    const body = editor.getBody();

    // Documento Completo mas o utilizador quer só o capítulo do bloco aberto: isola o
    // segmento (CHAPTER_SPLIT_PATTERN, o mesmo regex partilhado pelo resto da app) que
    // contém esse bloco, troca só ali, e reescreve o body com TODOS os segmentos (os
    // outros capítulos ficam bit-a-bit iguais) — Documento Completo continua carregado.
    // Sem .filter() de segmentos vazios (ao contrário de splitHtmlIntoParts): aqui o
    // array é reconstruído por join() para reescrever o body, um filter mudava o texto
    // reconstruído; não há problema de desalinhamento porque este índice nunca é cruzado
    // com chapters[]/splitHtmlIntoParts, só serve para join() de volta.
    const anchorHtml = scope === 'chapter' && activeChapterIndex === -1 && anchorBlock
        ? editor.dom.getOuterHTML(anchorBlock) : null;
    const segments = anchorHtml ? editor.getContent().split(CHAPTER_SPLIT_PATTERN) : null;
    const segIndex = segments ? segments.findIndex(s => s.includes(anchorHtml!)) : -1;
    if (segments && segIndex !== -1) {
        const count = countOccurrences(segments[segIndex], find);
        if (count === 0) return 0;
        segments[segIndex] = segments[segIndex].split(find).join(replaceWith);
        commitBodyHtml(editor, body, segments.join(''), anchorBlock);
        return count;
    }

    // Caso simples (inclui o bloco não ter caído em nenhum segmento acima — ex.: story
    // sem marcador de capítulo, mais seguro cair aqui que falhar calado): o que está
    // carregado no editor já é exatamente o âmbito pedido, ou serve de fallback seguro.
    // Reusa `segments` (join reconstrói o mesmo HTML, split é lookahead de largura zero)
    // em vez de voltar a serializar o body com getContent().
    const html = segments ? segments.join('') : editor.getContent();
    const count = countOccurrences(html, find);
    if (count === 0) return 0;
    commitBodyHtml(editor, body, html.split(find).join(replaceWith), anchorBlock);
    return count;
}
