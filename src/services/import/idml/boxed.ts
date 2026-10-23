// Numeral/título "dentro de uma caixa preta" do InDesign: o Rectangle preto não vem na story, só o texto a branco por
// cima (cor do run ou do estilo de parágrafo). Este módulo é o único que escreve e desfaz o CSS dessa caixa; quem
// precisa de saber que um segmento é um numeral em caixa lê `Segment.boxedNumeral`, nunca o HTML.

const WHITE = 'rgb(255,255,255)'; // saída de resolveFillColor para Color/Paper

export const isWhite = (resolvedColor: string): boolean => resolvedColor === WHITE;

/** Numeral romano ou número sozinho (candidato a caixa). */
export const isNumeral = (text: string): boolean => /^([IVXLCDM]+|\d+)$/i.test(text.trim());

const NUMERAL_STYLE = 'background:#000;color:#fff;padding:0.15em 0.6em';

/** Caixa pequena à volta do numeral (`escapedNumeral` já escapado). */
export const boxedNumeralHtml = (escapedNumeral: string): string => `<span style="${NUMERAL_STYLE}">${escapedNumeral}</span>`;

/** `<h1>` do bloco de título inteiro dentro da caixa preta: o texto branco herda a cor. */
export const BOXED_H1_OPEN = '<h1 class="p-center" style="background:#000;color:#fff;padding:0.6em 1em">';

const WHITE_SPAN = /<span style="color:rgb\(255,255,255\)">([^<]*)<\/span>/g;
const NUMERAL_SPAN = /<span style="background:#000;color:#fff;padding:0\.15em 0\.6em">([^<]*)<\/span>/g;

/**
 * Tira o texto branco ao HTML de uma linha (desembrulha, sem deixar <span> nu: o limpador de spans nus emparelha com o
 * 1.º </span> e embrulhava o texto do título no marcador de página). `wholeBlockBoxed`: o bloco vai num `<h1>` preto,
 * por isso a caixa pequena do numeral também sai.
 */
export function unboxWhite(html: string, wholeBlockBoxed: boolean): string {
    const out = html.replace(WHITE_SPAN, '$1');
    return wholeBlockBoxed ? out.replace(NUMERAL_SPAN, '$1') : out;
}
