import { cleanEditorDOM } from '../../../utils/html-cleaner';

/**
 * Limpeza do corpo do editor depois de cada setContent (carregamento, colar, inserir) — corre
 * pelo canal de conteúdo (contentChannel.ts, opção `normalize`). Devolve se mudou alguma coisa:
 * o canal reporta então o HTML já limpo (sem voltar a carregar o editor).
 */
export function normalizeEditorBody(body: HTMLElement): boolean {
    const before = body.innerHTML;
    cleanEditorDOM(body);
    // data-image-id nas imagens do servidor: tem de estar no HTML reportado (prepareEpubAssets).
    body.querySelectorAll<HTMLImageElement>('img:not([data-image-id])').forEach((img) => {
        const src = img.getAttribute('src');
        const match = src && src.includes('/api/ebooks/') ? src.match(/\/images\/([^/?]+)/) : null;
        if (!match?.[1]) return;
        img.setAttribute('data-image-id', match[1]);
        img.setAttribute('loading', 'lazy');
        img.setAttribute('alt', 'Imagem');
        if (!img.style.maxWidth) img.style.maxWidth = '100%';
        if (!img.style.height) img.style.height = 'auto';
    });
    return body.innerHTML !== before;
}
