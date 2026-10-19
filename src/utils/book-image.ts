// Imagem do livro: o ÚNICO dono da forma como uma imagem é referida no HTML do editor — URL do servidor, o id
// (`data-image-id`, ou o do próprio src), o cache-bust `?v=` e a <img> inserida. Sem imports de UI; o export é puro.
// Nunca escrever `/api/ebooks/…/images/…` nem partir `?v=` à mão noutro ficheiro — importar daqui.
import { PLACEHOLDER_ALT } from './image-alt';

export const imageSrc = (isbn: string, id: string): string => `/api/ebooks/${isbn}/images/${id}`;

/** O id no fim de um src `…/images/<id>[?query]`, ou undefined. */
export const imageIdFromSrc = (src: string): string | undefined => src.match(/\/images\/([^"'?/]+)/)?.[1];

/** Os ids a que uma <img> se refere: `data-image-id` e o do src (podem divergir depois de renomear à mão). */
export function imageIdsOf(img: Element): string[] {
    return [img.getAttribute('data-image-id'), imageIdFromSrc(img.getAttribute('src') || '')].filter((x): x is string => !!x);
}

/**
 * Mesmo id = mesmo src: o browser (e o iframe do editor) reaproveita da memória a imagem já carregada, por isso
 * bytes novos sobre o mesmo id só se veem com src novo. `?v=` força o pedido; um `?v=` anterior é substituído.
 */
export const bustSrc = (src: string, stamp: number = Date.now()): string => `${src.split('?')[0]}?v=${stamp}`;

/** `bustSrc` em todas as <img> do servidor de um HTML (depois de um import que reescreve as imagens). */
export const bustImageSrcs = (html: string, stamp: number = Date.now()): string =>
    html.replace(/(\bsrc="\/api\/ebooks\/[^"?]+\/images\/[^"?]+)(?:\?[^"]*)?"/g, `$1?v=${stamp}"`);

/** A <img> que o editor insere para uma imagem da galeria. */
export const imageTag = (isbn: string, id: string, alt: string = PLACEHOLDER_ALT): string =>
    `<img data-image-id="${id}" src="${imageSrc(isbn, id)}" alt="${alt}" style="max-width: 100%; height: auto;" loading="lazy" />`;

/** Ids referidos no HTML (data-image-id e src do servidor), sem repetidos, por ordem do documento. */
export function collectImageIds(html: string): string[] {
    const ids = new Set<string>();
    for (const m of html.matchAll(/data-image-id="([^"]+)"/g)) ids.add(m[1]);
    for (const m of html.matchAll(/src=["']\/api\/ebooks\/[^/]+\/images\/([^"'?]+)/g)) ids.add(m[1]);
    return [...ids];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renomear uma imagem no HTML: `data-image-id` e `/images/<id>` (exato — "a" não apanha "ab"). */
export const renameImageIn = (html: string, oldId: string, newId: string): string =>
    html.replace(new RegExp(`data-image-id="${escapeRe(oldId)}"`, 'g'), `data-image-id="${newId}"`)
        .replace(new RegExp(`/images/${escapeRe(oldId)}(?=["'?/]|$)`, 'g'), `/images/${newId}`);
