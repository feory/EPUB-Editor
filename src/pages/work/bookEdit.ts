/**
 * Edição do livro — operações de livro inteiro (capítulos, capitulares, Índice, links, page-list,
 * substituir), sem React nem reducer. Cada operação recebe o livro como está e devolve o que
 * mudar: HTML novo, COMO o commitar e o aviso ao utilizador (ou `null` = nada a fazer, em silêncio).
 *
 * Os dois commits existem por uma razão, e fica escrita aqui (antes estava num comentário do hook):
 *  - 'keep'  — transformação que não muda a estrutura de capítulos (título, nível, capitulares,
 *    ligações…): o capítulo ativo mantém-se e o editor sincroniza-se sem perder o undo.
 *  - 'reset' — reorder/eliminar/criar: o índice do capítulo ativo deixa de valer depois de
 *    mover/eliminar, restaurá-lo seria a posição errada → o ebook recarrega sem capítulo ativo.
 */
import { renameChapterPart, changeChapterLevel, moveChapters, deleteChapterPart, insertChapterPart } from '../../utils/toc';
import { matchChapterMarkerElement } from '../../utils/chapters';
import { applyDropCapToFirstParagraph, countOccurrences } from '../../utils/html-cleaner';
import { linkIndiceEntries, linkOneIndiceEntry, unlinkOneIndiceEntry, listSubtitles } from '../../utils/indice-links';
import { unwrapCommentAnchor } from '../../utils/comment-anchor';
import { fixLinks, validateLinks } from '../../services/validation/link-validator';
import { insertPageBreaks } from '../../services/page-list/page-list';
import type { PageAnchor } from '../../services/page-list/page-list';

export type Level = 'h1' | 'h2' | 'h3' | 'break';

/** O livro como o hook o vê: HTML mais recente, o split em capítulos e a sua classificação. */
export interface Book {
    html: string;
    parts: string[];
    chapters: { title: string; level: Level }[];
}

export interface Notice { type: 'success' | 'info' | 'error'; text: string }

export interface BookEdit {
    html?: string;
    commit: 'keep' | 'reset';
    notice?: Notice;
}

const levelsOf = (book: Book) => book.chapters.map(c => c.level);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const keep = (html: string, text: string): BookEdit => ({ html, commit: 'keep', notice: { type: 'success', text } });
const reset = (html: string, text: string): BookEdit => ({ html, commit: 'reset', notice: { type: 'success', text } });
const info = (text: string): BookEdit => ({ commit: 'keep', notice: { type: 'info', text } });
const fail = (text: string): BookEdit => ({ commit: 'keep', notice: { type: 'error', text } });

export function renameChapter(book: Book, index: number, newTitle: string): BookEdit | null {
    if (!book.chapters[index] || !book.parts[index]) return null;
    const part = renameChapterPart(book.parts[index], newTitle);
    if (part === book.parts[index]) return null; // marcador não encontrado
    const parts = [...book.parts];
    parts[index] = part;
    return keep(parts.join(''), 'Título do capítulo atualizado!');
}

export function changeLevel(book: Book, index: number, level: Level): BookEdit | null {
    const chapter = book.chapters[index];
    if (!chapter || chapter.level === level) return null;
    const part = changeChapterLevel(book.parts[index], level);
    if (part === book.parts[index]) return null;
    const parts = [...book.parts];
    parts[index] = part;
    return keep(parts.join(''), 'Nível do capítulo atualizado!');
}

export function moveChapter(book: Book, from: number, to: number): BookEdit | null {
    if (!book.chapters[from] || from === to) return null;
    const html = moveChapters(book.parts, levelsOf(book), from, to);
    if (html === book.parts.join('')) return null; // soltar dentro da própria subárvore
    return reset(html, `Capítulo ${book.chapters[from].title} movido!`);
}

export function deleteChapter(book: Book, index: number): BookEdit | null {
    if (!book.chapters[index]) return null;
    const html = deleteChapterPart(book.parts, levelsOf(book), index);
    return reset(html, `Capítulo ${book.chapters[index].title} eliminado!`);
}

export function addChapter(book: Book): BookEdit {
    // "1.º capítulo" = 1.º h1 EXPLÍCITO (marcador -h1): as quebras planas do início (Frontespício, Ficha Técnica…)
    // contam como h1 na estrutura mas continuam a ser o que vem antes dos capítulos.
    const explicit = book.parts.map((p): Level => matchChapterMarkerElement(p)?.level === 'h1' ? 'h1' : 'break');
    return reset(insertChapterPart(book.parts, explicit, 'Novo Capítulo'), 'Capítulo criado!');
}

export function applyDropCaps(book: Book): BookEdit {
    let applied = 0, already = 0;
    const parts = book.parts.map((p) => {
        const r = applyDropCapToFirstParagraph(p);
        if (r.status === 'applied') applied++;
        else if (r.status === 'already') already++;
        return r.part;
    });
    const html = parts.join('');
    if (html === book.html) {
        return info(already > 0
            ? `Todos os capítulos já tinham capitular (${already}).`
            : 'Nenhum capítulo elegível para capitular.');
    }
    return keep(html, `${plural(applied, 'capitular aplicada', 'capitulares aplicadas')}${already > 0 ? `, ${already} já ${already === 1 ? 'tinha' : 'tinham'}` : ''}.`);
}

/** Ligar as entradas do Índice aos capítulos, em lote. */
export function linkIndice(book: Book): BookEdit {
    const { parts, linked, anchored } = linkIndiceEntries(book.parts);
    const html = parts.join('');
    if (html === book.html) return info('Nenhum Índice encontrado, ou nenhuma entrada correspondeu a um capítulo.');
    return keep(html, `${plural(linked, 'entrada ligada', 'entradas ligadas')} a ${plural(anchored, 'capítulo', 'capítulos')}.`);
}

const LINK_FAIL: Record<string, string> = {
    'entry-paragraph-not-found': 'não encontrei o parágrafo do Índice onde tinhas o cursor.',
    'target-marker-missing': 'o capítulo escolhido não tem marcador de capítulo válido.',
    'target-subtitle-missing': 'o subtítulo escolhido já não existe.',
};

/** Ligar UMA entrada do Índice (ou, com `targetChapterIndex === null`, remover a ligação). */
export function linkIndiceEntry(
    book: Book, pIndex: number, indiceChapterIndex: number, targetChapterIndex: number | null, subIndex?: number,
): BookEdit {
    if (targetChapterIndex === null) {
        const res = unlinkOneIndiceEntry(book.parts, indiceChapterIndex, pIndex);
        if (!res.ok) return fail('Não foi possível remover a ligação desta entrada.');
        return keep(res.parts.join(''), 'Ligação removida.');
    }
    const { parts, ok, reason } = linkOneIndiceEntry(book.parts, indiceChapterIndex, pIndex, targetChapterIndex, subIndex);
    if (!ok) return fail('Não foi possível ligar esta entrada: ' + (LINK_FAIL[reason ?? ''] ?? 'tenta de novo.'));
    const title = subIndex !== undefined
        ? listSubtitles(book.parts).find(s => s.chapterIndex === targetChapterIndex && s.index === subIndex)?.text
        : book.chapters[targetChapterIndex]?.title;
    return keep(parts.join(''), title ? `Entrada ligada a "${title}".` : 'Entrada ligada.');
}

export type LinkReport = ReturnType<typeof validateLinks>;

/**
 * Corrigir o espaçamento de links no livro inteiro. Reanalisa sempre (mesmo sem nada corrigido):
 * um falso positivo da validação (heurística de texto) pode não ter contrapartida real no fixLinks
 * (DOM), e o painel ficava com os problemas antigos presos. O relatório novo vai ao lado do edit.
 */
export function fixBookLinks(book: Book): { edit: BookEdit; report: LinkReport | null } {
    const { html: fixedHtml, fixed } = fixLinks(book.html);
    const changed = fixed > 0 && fixedHtml !== book.html;
    const report = validateLinks(fixed > 0 ? fixedHtml : book.html);
    const rest = report.issues.length > 0 ? report : null;
    return {
        report: rest,
        edit: changed ? keep(fixedHtml, `${plural(fixed, 'link corrigido', 'links corrigidos')}.`) : info('Nenhum link para corrigir.'),
    };
}

export function generatePageList(book: Book, anchors: PageAnchor[]): BookEdit {
    const { html, inserted, total } = insertPageBreaks(book.html, anchors);
    if (inserted === 0) return info('Nenhuma página do PDF foi encontrada no texto do livro.');
    return keep(html, `Page-list: ${inserted} de ${total} páginas marcadas.`);
}

export const countInBook = (book: Book, find: string): number => countOccurrences(book.html, find);

/** Substitui em todo o livro; `count` é o nº de ocorrências (0 = nada a fazer). */
export function replaceInBook(book: Book, find: string, replaceWith: string): { edit: BookEdit | null; count: number } {
    const count = countOccurrences(book.html, find);
    if (count === 0) return { edit: null, count: 0 };
    return { edit: { html: book.html.split(find).join(replaceWith), commit: 'keep' }, count };
}

/** Tira a âncora de um Comment do livro inteiro (o capítulo pode não estar montado no editor). */
export function removeCommentAnchor(book: Book, anchorId: string): BookEdit | null {
    const html = unwrapCommentAnchor(book.html, anchorId);
    return html === book.html ? null : { html, commit: 'keep' };
}
