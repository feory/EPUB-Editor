import type JSZip from 'jszip';

// Estilos lidos de UM pacote IDML (Resources/Styles.xml + Graphic.xml): o que as histórias precisam para
// traduzir negrito/itálico/versaletes (estilos de carácter), recuos e espaçamento (estilos de parágrafo) e
// cores de preenchimento das células de tabela. Lido por idmlZip — antes eram variáveis globais do módulo.
export type CharStyle = { fontStyle?: string; cap?: string; position?: string };
export type ParaStyle = { left: number; first: number; fontStyle?: string; cap?: string; spaceBefore: number; spaceAfter: number };
export type FillColor = { space: 'CMYK' | 'RGB'; values: number[] };

export interface IdmlStyles {
    charStyles: Map<string, CharStyle>;
    paraIndents: Map<string, ParaStyle>;
    colors: Map<string, FillColor>;
}

export const NO_STYLES: IdmlStyles = { charStyles: new Map(), paraIndents: new Map(), colors: new Map() };

export async function readIdmlStyles(zip: JSZip): Promise<IdmlStyles> {
    return { charStyles: await scanCharStyles(zip), paraIndents: await scanParaIndents(zip), colors: await scanColors(zip) };
}

// FontStyle/Capitalization definidos no ESTILO DE CARÁCER (Resources/Styles.xml), aplicados
// via AppliedCharacterStyle sem atributo no run (ex. CharacterStyle/Bold -> FontStyle="Bold",
// versaletes -> Capitalization="SmallCaps"). Sem isto, negrito/itálico/versaletes perdiam-se.
// ponytail: estado por idmlZip (extractIdml é sequencial e repõe-no antes de renderizar cada um).

async function scanCharStyles(zip: JSZip): Promise<Map<string, { fontStyle?: string; cap?: string; position?: string }>> {
    const xml = await zip.file('Resources/Styles.xml')?.async('string') ?? '';
    const map = new Map<string, { fontStyle?: string; cap?: string; position?: string }>();
    for (const m of xml.matchAll(/<CharacterStyle\b([^>]*)>/g)) {
        const self = /\bSelf="([^"]*)"/.exec(m[1])?.[1];
        if (!self) continue;
        const fontStyle = /\bFontStyle="([^"]*)"/.exec(m[1])?.[1];
        const cap = /\bCapitalization="([^"]*)"/.exec(m[1])?.[1];
        const position = /\bPosition="([^"]*)"/.exec(m[1])?.[1];
        if (fontStyle || cap || position) map.set(self, { fontStyle, cap, position });
    }
    return map;
}

// Cor de preenchimento das células de tabela (Resources/Graphic.xml) — CMYK ou RGB.
// ponytail: estado por idmlZip, mesmo padrão de CHAR_STYLES/PARA_INDENTS.

async function scanColors(zip: JSZip): Promise<Map<string, { space: 'CMYK' | 'RGB'; values: number[] }>> {
    const xml = await zip.file('Resources/Graphic.xml')?.async('string') ?? '';
    const map = new Map<string, { space: 'CMYK' | 'RGB'; values: number[] }>();
    for (const m of xml.matchAll(/<Color\b([^>]*)\/>/g)) {
        const self = /\bSelf="([^"]*)"/.exec(m[1])?.[1];
        const space = /\bSpace="([^"]*)"/.exec(m[1])?.[1];
        const colorValue = /\bColorValue="([^"]*)"/.exec(m[1])?.[1];
        if (!self || !colorValue || (space !== 'CMYK' && space !== 'RGB')) continue;
        map.set(self, { space, values: colorValue.split(' ').map(Number) });
    }
    return map;
}

// FillColor/FillTint de uma célula de tabela → "rgb(r,g,b)" CSS, ou '' sem preenchimento
// ("Swatch/None", cor desconhecida, ou tint 0). Tint = mistura com o papel (branco): reduz cada
// componente proporcionalmente antes de converter CMYK→RGB (fórmula standard: R=255(1-C)(1-K)).
export function resolveFillColor(styles: IdmlStyles, colorRef: string | null, tintAttr: string | null): string {
    if (!colorRef || colorRef === 'Swatch/None' || colorRef === 'Color/None') return '';
    const tint = (parseFloat(tintAttr ?? '100') || 0) / 100;
    if (tint <= 0) return '';
    const def = styles.colors.get(colorRef);
    if (!def) return '';
    if (def.space === 'RGB') {
        const [r, g, b] = def.values;
        const mix = (c: number) => Math.round(255 - (255 - c) * tint);
        return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
    }
    const [c, m, y, k] = def.values.map(v => (v / 100) * tint);
    const rgb = (a: number) => Math.round(255 * (1 - a) * (1 - k));
    return `rgb(${rgb(c)},${rgb(m)},${rgb(y)})`;
}

// Recuo de parágrafo (LeftIndent/FirstLineIndent, em PONTOS) definido no estilo de parágrafo
// (Resources/Styles.xml). Honrado como margin-left + text-indent (hanging quando First<0).
// ponytail: pt→em com divisor fixo 12 (corpo não tem PointSize fiável nos runs); afinar se preciso.


async function scanParaIndents(zip: JSZip): Promise<Map<string, { left: number; first: number; fontStyle?: string; cap?: string; spaceBefore: number; spaceAfter: number }>> {
    const xml = await zip.file('Resources/Styles.xml')?.async('string') ?? '';
    const map = new Map<string, { left: number; first: number; fontStyle?: string; cap?: string; spaceBefore: number; spaceAfter: number }>();
    for (const m of xml.matchAll(/<ParagraphStyle\b([^>]*)>/g)) {
        const self = /\bSelf="([^"]*)"/.exec(m[1])?.[1];
        if (!self) continue;
        const left = parseFloat(/\bLeftIndent="([^"]*)"/.exec(m[1])?.[1] || '0') || 0;
        const first = parseFloat(/\bFirstLineIndent="([^"]*)"/.exec(m[1])?.[1] || '0') || 0;
        // FontStyle no estilo de PARÁGRAFO (ex. Num2 Bold) → herdado pelos runs sem override
        // próprio (o marcador "a)"/"i)" das alíneas; o corpo tem FontStyle="Roman" explícito).
        const fontStyle = /\bFontStyle="([^"]*)"/.exec(m[1])?.[1];
        // Capitalization também pode vir definida no ESTILO DE PARÁGRAFO (não só no run/estilo de
        // carácter, ver CHAR_STYLES) — ex. um título "CAD AUT_TIT" com Capitalization="SmallCaps"
        // na própria definição do ParagraphStyle; sem este fallback saía em minúsculas.
        const cap = /\bCapitalization="([^"]*)"/.exec(m[1])?.[1];
        // Espaço antes/depois do parágrafo, em pontos (SpaceBefore/SpaceAfter do InDesign).
        const spaceBefore = parseFloat(/\bSpaceBefore="([^"]*)"/.exec(m[1])?.[1] || '0') || 0;
        const spaceAfter = parseFloat(/\bSpaceAfter="([^"]*)"/.exec(m[1])?.[1] || '0') || 0;
        if (left || first || fontStyle || cap || spaceBefore || spaceAfter) map.set(self, { left, first, fontStyle, cap, spaceBefore, spaceAfter });
    }
    return map;
}
