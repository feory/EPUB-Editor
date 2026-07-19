import { cleanEpubHtml } from '../../utils/html-cleaner';

const decodeHtmlEntities = (text: string): string => {
    const doc = new DOMParser().parseFromString(`<div>${text}</div>`, 'text/html');
    return doc.body.textContent || text;
};

export const escapeXml = (unsafe: string): string =>
    unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });

export const prepareTextForXml = (text: string): string =>
    escapeXml(decodeHtmlEntities(text));

export { decodeHtmlEntities };

const ENTITY_MAP = new Map<string, string>();
for (const [entity, char] of Object.entries({
    '&nbsp;': '&#160;',
    '&ordm;': 'º', '&ordf;': 'ª',
    '&laquo;': '«', '&raquo;': '»',
    '&aacute;': 'á', '&Aacute;': 'Á',
    '&eacute;': 'é', '&Eacute;': 'É',
    '&iacute;': 'í', '&Iacute;': 'Í',
    '&oacute;': 'ó', '&Oacute;': 'Ó',
    '&uacute;': 'ú', '&Uacute;': 'Ú',
    '&agrave;': 'à', '&Agrave;': 'À',
    '&atilde;': 'ã', '&Atilde;': 'Ã',
    '&otilde;': 'õ', '&Otilde;': 'Õ',
    '&ccedil;': 'ç', '&Ccedil;': 'Ç',
    '&acirc;': 'â', '&Acirc;': 'Â',
    '&ecirc;': 'ê', '&Ecirc;': 'Ê',
    '&ocirc;': 'ô', '&Ocirc;': 'Ô',
    '&auml;': 'ä', '&Auml;': 'Ä',
    '&euml;': 'ë', '&Euml;': 'Ë',
    '&iuml;': 'ï', '&Iuml;': 'Ï',
    '&ouml;': 'ö', '&Ouml;': 'Ö',
    '&uuml;': 'ü', '&Uuml;': 'Ü',
    '&ndash;': '–', '&mdash;': '—',
    '&lsquo;': '‘', '&rsquo;': '’',
    '&ldquo;': '“', '&rdquo;': '”',
    '&bull;': '•', '&hellip;': '…',
    '&minus;': '−', '&plus;': '+', '&times;': '×', '&divide;': '÷', '&plusmn;': '±',
    '&copy;': '©', '&reg;': '®', '&trade;': '™',
    '&euro;': '€', '&pound;': '£', '&yen;': '¥', '&cent;': '¢',
    '&sect;': '§', '&para;': '¶', '&dagger;': '†', '&Dagger;': '‡',
    '&prime;': '′', '&Prime;': '″', '&infin;': '∞',
    '&middot;': '·', '&iquest;': '¿', '&iexcl;': '¡',
    '&frac12;': '½', '&frac14;': '¼', '&frac34;': '¾',
    '&sup1;': '¹', '&sup2;': '²', '&sup3;': '³',
    '&ensp;': ' ', '&emsp;': ' ', '&thinsp;': ' ',
    '&shy;': '­', '&zwj;': '‍', '&zwnj;': '‌',
})) {
    ENTITY_MAP.set(entity, char);            // &nbsp;
    ENTITY_MAP.set(entity.slice(0, -1), char); // &nbsp (sem ;)
}
// One tokenizing pass instead of 60+ full-document scans. Greedy [a-zA-Z0-9]* on the
// no-semicolon variant reproduces the old `(?![a-zA-Z0-9])` guard (&nbspX → token not in map).
const ENTITY_TOKEN = /&[a-zA-Z][a-zA-Z0-9]*;?/g;

export const cleanHtmlForXhtml = (html: string): string => {
    let cleaned = html.replace(ENTITY_TOKEN, (tok) => ENTITY_MAP.get(tok) ?? tok);

    cleaned = cleanEpubHtml(cleaned);

    return cleaned
        .replace(/<(br|hr|img)([^>]*)>/gi, (_match, tag, attrs) => {
            const cleanAttrs = attrs.trim().replace(/\/$/, '').trim();
            const result = `<${tag.toLowerCase()}${cleanAttrs ? ' ' + cleanAttrs : ''} />`;
            return result.replace(/\s+\/>$/, ' />');
        })
        .replace(/\s+>/g, '>')
        .replace(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[a-f0-9]+);)/gi, '&amp;');
};
