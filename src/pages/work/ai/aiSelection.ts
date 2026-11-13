// "Só estes blocos": os blocos selecionados no editor limitam o que o assistente pode alterar. O editor diz QUAIS são (posição +
// texto); aqui traduz-se para o endereço nas `parts[]` do livro e fixa-se nas regras — o modelo não escolhe o âmbito, para não
// alterar outros blocos por engano. Só blocos de topo de texto seguidos (p, h1–h6), dentro de UM capítulo.
import { blockKey, type BookRule, type RuleSelect } from '../../../utils/book-rules';

export type RuleBlock = NonNullable<RuleSelect['block']>;

/** O que o editor sabe dos blocos selecionados: a posição do primeiro entre os blocos de topo do que ele mostra, e tag e início do texto de cada um. */
export interface SelectedBlocks { index: number; tags: string[]; texts: string[] }

const childrenOf = (part: string) => Array.from(new DOMParser().parseFromString(part, 'text/html').body.children);
const matchesAt = (els: Element[], at: number, sel: SelectedBlocks) =>
    at >= 0 && sel.texts.every((text, i) => els[at + i] && els[at + i].tagName.toLowerCase() === sel.tags[i] && blockKey(els[at + i].textContent) === text);

/**
 * Onde estão os blocos nas `parts`. `activeChapter` -1 = o editor mostra o livro todo (a posição conta desde o início do livro).
 * Primeiro a posição indicada; se o texto não bate, procura a sequência na parte (ou no livro) mas só se for única. null = não se
 * encontra (ou atravessa capítulos).
 */
export function locateBlocks(parts: string[], sel: SelectedBlocks, activeChapter: number): RuleBlock | null {
    const parsed = parts.map(childrenOf);
    const at = (chapter: number, index: number): RuleBlock => ({ chapter, index, texts: sel.texts });
    if (activeChapter >= 0) {
        if (matchesAt(parsed[activeChapter] ?? [], sel.index, sel)) return at(activeChapter, sel.index);
    } else {
        let offset = 0;
        for (let ci = 0; ci < parsed.length; ci++) {
            const local = sel.index - offset;
            if (local >= 0 && local < parsed[ci].length) { if (matchesAt(parsed[ci], local, sel)) return at(ci, local); break; }
            offset += parsed[ci].length;
        }
    }
    const found: RuleBlock[] = [];
    (activeChapter >= 0 ? [activeChapter] : parsed.map((_, i) => i)).forEach((ci) => parsed[ci]?.forEach((_, index) => { if (matchesAt(parsed[ci], index, sel)) found.push(at(ci, index)); }));
    return found.length === 1 ? found[0] : null;
}

/** Fixa as regras aos blocos: o que o modelo pôs em capítulos/profundidade/posição deixa de valer. */
export const scopeRules = (rules: BookRule[], block: RuleBlock): BookRule[] =>
    rules.map((r) => ({ ...r, select: { tag: r.select.tag, hasClass: r.select.hasClass, noClass: r.select.noClass, hasStyle: r.select.hasStyle, startsWith: r.select.startsWith, block } }));

/** O que se diz ao modelo (junto ao pedido) sobre os blocos: o HTML deles, para escolher as tags e as classes certas. */
export function blockContext(parts: string[], block: RuleBlock): string {
    const els = childrenOf(parts[block.chapter] ?? '').slice(block.index, block.index + block.texts.length);
    const html = els.map((e) => e.outerHTML).join('\n').slice(0, 800);
    const tags = [...new Set(els.map((e) => e.tagName.toLowerCase()))];
    const what = els.length === 1 ? 'UM bloco' : `${els.length} blocos seguidos`;
    return `[Contexto: o utilizador selecionou ${what} e, só neste pedido, o pedido aplica-se SÓ a ${els.length === 1 ? 'ele' : 'eles'}:\n${html}\nUsa preview_rules com select.tag=${JSON.stringify(tags)} (o editor limita a regra a ${els.length === 1 ? 'esse bloco' : 'esses blocos'}; não uses "operations"). Não precisas de survey_book para localizar ${els.length === 1 ? 'o bloco' : 'os blocos'}.]\n`;
}
