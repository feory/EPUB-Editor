import type { AiTool } from './aiTool';
import editorMd from '../../../docs/content/editor.md?raw';
import comofazerMd from '../../../docs/content/comofazer.md?raw';
import assistenteMd from '../../../docs/content/assistente.md?raw';

// O assistente responde a "como faço X?" com os guias da própria aplicação (os mesmos da página Ajuda): esta ferramenta
// escolhe as secções que mais se parecem com a pergunta; o modelo só resume o que elas dizem.
export interface DocSection { guide: string; title: string; text: string }

const MAX_SECTIONS = 3;
const MAX_CHARS = 2500;
const STOP = new Set(['como', 'posso', 'fazer', 'faco', 'para', 'que', 'uma', 'um', 'uns', 'umas', 'por', 'com', 'sem', 'dos', 'das', 'nos', 'nas', 'the', 'onde', 'qual', 'quais', 'quero', 'preciso', 'consigo', 'livro']);

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Parte um guia nas secções `## título` (o resto do título, `{admin}`, deixa de fora as de administração). */
export function sectionsOf(guide: string, md: string): DocSection[] {
    return md.split(/^(?=## )/m).filter((b) => b.startsWith('## ')).flatMap((b) => {
        const title = b.slice(3, b.indexOf('\n')).trim();
        return title.includes('{admin}') ? [] : [{ guide, title: title.replace(/^\d+\.\s*/, ''), text: b.trim() }];
    });
}

export const DOCS: DocSection[] = [
    ...sectionsOf('Como fazer', comofazerMd),
    ...sectionsOf('Editor', editorMd),
    ...sectionsOf('Assistente', assistenteMd),
];

/** As secções que melhor respondem à pergunta, por ordem: palavra no título vale 3, no corpo 1 (a raiz da palavra, para apanhar plurais). */
export function searchDocs(query: string, docs: DocSection[] = DOCS): DocSection[] {
    const stems = [...new Set(plain(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)))].map((w) => w.slice(0, Math.max(4, w.length - 2)));
    if (!stems.length) return [];
    return docs
        .map((d) => {
            const title = plain(d.title), body = plain(d.text);
            return { d, score: stems.reduce((n, s) => n + (title.includes(s) ? 3 : 0) + (body.includes(s) ? 1 : 0), 0) };
        })
        .filter((x) => x.score >= Math.min(2, stems.length * 3))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_SECTIONS)
        .map((x) => x.d);
}

/** "Como faço X?": devolve as secções dos guias que tratam do assunto. Não altera nada. */
export const searchDocsTool: AiTool = {
    name: 'search_docs',
    run(input) {
        const query = typeof input.query === 'string' ? input.query.trim() : '';
        if (!query) return { content: 'Falta a pergunta (query).', is_error: true };
        const found = searchDocs(query);
        if (!found.length) return { content: JSON.stringify({ secoes: [], nota: 'Os guias não tratam deste assunto: diz ao utilizador que não encontraste, sem inventar passos.' }) };
        return { content: JSON.stringify({ secoes: found.map((d) => ({ guia: d.guide, titulo: d.title, texto: d.text.length > MAX_CHARS ? `${d.text.slice(0, MAX_CHARS)}…` : d.text })) }) };
    },
};
