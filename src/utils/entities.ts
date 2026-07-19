/**
 * Shared HTML entity decoding utilities.
 * Used by main thread (useEbookWork, heuristics) and web worker.
 */
export const HTML_ENTITIES: Record<string, string> = {
    // Espaços e símbolos comuns
    '&nbsp;': ' ', '&ensp;': ' ', '&emsp;': ' ', '&thinsp;': ' ',
    '&hairsp;': ' ', '&ZeroWidthSpace;': '', '&#8203;': '',
    '&ordm;': 'º', '&ordf;': 'ª',
    '&sect;': '§', '&para;': '¶', '&middot;': '·',
    '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&apos;': "'",
    // Moedas
    '&euro;': '€', '&pound;': '£', '&yen;': '¥', '&cent;': '¢',
    // Símbolos legais e marcas
    '&copy;': '©', '&reg;': '®', '&trade;': '™',
    // Matemática e medidas
    '&deg;': '°', '&plusmn;': '±', '&times;': '×', '&divide;': '÷',
    '&frac12;': '½', '&frac14;': '¼', '&frac34;': '¾',
    '&sup1;': '¹', '&sup2;': '²', '&sup3;': '³',
    '&minus;': '−', '&radic;': '√', '&infin;': '∞',
    // Pontuação e aspas
    '&mdash;': '—', '&ndash;': '–', '&hellip;': '…',
    '&ldquo;': '"', '&rdquo;': '"', '&lsquo;': "'", '&rsquo;': "'",
    '&laquo;': '«', '&raquo;': '»', '&sbquo;': '‚', '&bdquo;': '„',
    '&bull;': '•', '&dagger;': '†', '&Dagger;': '‡', '&permil;': '‰',
    '&iquest;': '¿', '&iexcl;': '¡',
    // Português - acentos agudos
    '&aacute;': 'á', '&Aacute;': 'Á',
    '&eacute;': 'é', '&Eacute;': 'É',
    '&iacute;': 'í', '&Iacute;': 'Í',
    '&oacute;': 'ó', '&Oacute;': 'Ó',
    '&uacute;': 'ú', '&Uacute;': 'Ú',
    // Português - acentos graves
    '&agrave;': 'à', '&Agrave;': 'À',
    '&egrave;': 'è', '&Egrave;': 'È',
    '&igrave;': 'ì', '&Igrave;': 'Ì',
    '&ograve;': 'ò', '&Ograve;': 'Ò',
    '&ugrave;': 'ù', '&Ugrave;': 'Ù',
    // Português - tils
    '&atilde;': 'ã', '&Atilde;': 'Ã',
    '&otilde;': 'õ', '&Otilde;': 'Õ',
    '&ntilde;': 'ñ', '&Ntilde;': 'Ñ',
    // Português - cedilha
    '&ccedil;': 'ç', '&Ccedil;': 'Ç',
    // Acentos circunflexos
    '&acirc;': 'â', '&Acirc;': 'Â',
    '&ecirc;': 'ê', '&Ecirc;': 'Ê',
    '&icirc;': 'î', '&Icirc;': 'Î',
    '&ocirc;': 'ô', '&Ocirc;': 'Ô',
    '&ucirc;': 'û', '&Ucirc;': 'Û',
    // Tremas
    '&auml;': 'ä', '&Auml;': 'Ä',
    '&euml;': 'ë', '&Euml;': 'Ë',
    '&iuml;': 'ï', '&Iuml;': 'Ï',
    '&ouml;': 'ö', '&Ouml;': 'Ö',
    '&uuml;': 'ü', '&Uuml;': 'Ü',
    '&yuml;': 'ÿ', '&Yuml;': 'Ÿ',
    // Outros caracteres europeus
    '&szlig;': 'ß', '&eth;': 'ð', '&ETH;': 'Ð',
    '&thorn;': 'þ', '&THORN;': 'Þ',
    '&aelig;': 'æ', '&AElig;': 'Æ',
    '&oelig;': 'œ', '&OElig;': 'Œ',
    '&aring;': 'å', '&Aring;': 'Å',
    '&oslash;': 'ø', '&Oslash;': 'Ø'
};

// Pre-compiled regex pattern for all entities (10x faster than individual replacements)
const ENTITY_PATTERN = new RegExp(
    Object.keys(HTML_ENTITIES)
        .map(e => {
            const escaped = e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const withoutSemi = e.endsWith(';') ? e.slice(0, -1) : e;
            return e.endsWith(';')
                ? `${escaped}|${withoutSemi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-zA-Z0-9])`
                : escaped;
        })
        .join('|'),
    'g'
);

export function decodeEntities(text: string): string {
    return text.replace(ENTITY_PATTERN, (match) => {
        if (HTML_ENTITIES[match]) return HTML_ENTITIES[match];
        const withSemi = match + ';';
        return HTML_ENTITIES[withSemi] || match;
    });
}
