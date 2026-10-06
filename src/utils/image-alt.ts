// Convenção do "alt ainda não escrito": o importador e o editor põem um texto genérico para a imagem
// não ficar sem alt; o export só o troca por "Imagem {id}" quando o utilizador não escreveu nenhum.

export const PLACEHOLDER_ALT = 'Imagem';           // imagem inserida no editor / vinda do servidor
export const IMPORTED_ALT = 'Imagem importada';    // imagem extraída de um documento no import

export const isPlaceholderAlt = (alt: string | null | undefined): boolean => {
    const a = (alt ?? '').trim();
    return a === '' || a === PLACEHOLDER_ALT || a === IMPORTED_ALT;
};
