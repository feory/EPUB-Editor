import type { AiTool } from './aiTool';

const MIN_QUERY = 2;
const MAX_QUERY = 120;
const MAX_HITS = 20;
const EXCERPT = 160;

/** Sem maiúsculas nem acentos, espaços normalizados: "Estratégia  de" encontra "estrategia de". Mantém o comprimento (NFD só em letras latinas simples). */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * "Onde aparece X?": procura texto nos blocos de topo do livro (o mesmo âmbito das regras) e devolve, por bloco, o capítulo, a
 * posição, a tag.classes e um excerto à volta do achado. Só lê; no máximo MAX_HITS resultados com EXCERPT caracteres cada, para
 * o que sai do livro para o modelo ser pouco.
 */
export const findTextTool: AiTool = {
    name: 'find_text',
    run(input, { workspace }) {
        const query = squash(String(input.query ?? ''));
        if (query.length < MIN_QUERY || query.length > MAX_QUERY) return { content: `query tem de ter entre ${MIN_QUERY} e ${MAX_QUERY} caracteres`, is_error: true };
        const only = Array.isArray(input.chapters) ? new Set(input.chapters.filter((n): n is number => Number.isInteger(n))) : null;
        const limit = Math.min(MAX_HITS, Math.max(1, Math.floor(Number(input.limit)) || MAX_HITS));
        const needle = fold(query);

        const parts = workspace.parts();
        const hits: { capitulo: number; titulo: string; bloco: number; tipo: string; ocorrencias: number; comecaPor: boolean; excerto: string }[] = [];
        let total = 0;
        parts.forEach((part, ci) => {
            if (only && !only.has(ci)) return;
            const doc = new DOMParser().parseFromString(part, 'text/html');
            const title = squash(doc.querySelector('p[class*="chapter-break"]')?.getAttribute('data-title') ?? doc.querySelector('h1,h2')?.textContent ?? '') || `Capítulo ${ci}`;
            Array.from(doc.body.children).forEach((el, bi) => {
                if (/\bchapter-(break|anchor)/.test(el.className)) return;
                const text = squash(el.textContent ?? '');
                const hay = fold(text);
                if (hay.length !== text.length) return; // NFD mudou o comprimento (caso raro): as posições não bateriam
                const at = hay.indexOf(needle);
                if (at < 0) return;
                let count = 0;
                for (let i = at; i >= 0; i = hay.indexOf(needle, i + needle.length)) count++;
                total++;
                if (hits.length >= limit) return;
                const from = Math.max(0, at - (EXCERPT - needle.length) / 2);
                const to = Math.min(text.length, from + EXCERPT);
                hits.push({
                    capitulo: ci, titulo: title, bloco: bi, tipo: [el.tagName.toLowerCase(), ...Array.from(el.classList).sort()].join('.'),
                    ocorrencias: count, comecaPor: at === 0,
                    excerto: `${from > 0 ? '…' : ''}${text.slice(from, to)}${to < text.length ? '…' : ''}`,
                });
            });
        });
        return { content: JSON.stringify({
            procura: query, blocosEncontrados: total, mostrados: hits.length, resultados: hits,
            nota: 'só blocos de topo (parágrafos, títulos, listas, caixas…); "bloco" é a posição no capítulo e "capitulo" o índice do survey_book. "comecaPor": o bloco começa pelo texto, por isso select.startsWith o apanha (2–120 caracteres).',
        }) };
    },
};
