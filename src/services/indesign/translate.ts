// Tradução de parágrafo: estilo original do InDesign (CSS resolvido) → estilos do editor.
// Sem I/O nem DOM — testável sozinho (translate.test.ts). Usado pelo convert (aplicar) e pelo verify
// (comparar a intenção do original com a do optimizado).
//
//   intentOf(props, bodySize)            → Intent        (a ÚNICA tabela de limiares)
//   translateParagraph(intent, context)  → { tag, classes, align? } | { remove }
//   translateSpan(ownProps, targets)     → { wraps, classes } | { remove }
//   preservedOf(intent)                  → os campos que a tradução promete manter (o verify compara estes)

export type Props = Record<string, string>;

export type Intent = {
    align: 'left' | 'center' | 'right' | 'justify';
    indent: 'none' | 'first' | 'hanging';   // hanging = recuo pendente longo (alíneas); curto conta como 'none'
    block: boolean;                 // bloco recolhido (margem esquerda ≥ 1em, sem recuo pendente)
    above: 'none' | 'top' | 'space';
    below: boolean;
    small: boolean;                 // corpo < 95% do texto corrente
    bold: boolean; italic: boolean; upper: boolean;
    borderTop: boolean; borderBottom: boolean;
};

export type ParagraphContext = {
    targets: string[];              // targets do mapa, em bruto (ex. "h3", "p-legendas p-bold", "__remove__")
    where: 'body' | 'note' | 'table';
    frontMatter: boolean;           // página antes do Índice: não há capítulos
    text: string;                   // texto do parágrafo (para reconhecer separadores *)
    vocabulary: Set<string>;        // classes do editor (editorVocabulary do CSS do editor)
};
type BlockTag = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
type ParagraphResult = { remove: true } | { tag: BlockTag; classes: string[]; align?: 'left' | 'right' };

type SpanResult = { remove: true } | { wraps: string[]; classes: string[] };

// "Forma" do parágrafo: o que uma classe forçada no mapa substitui (p-indent combina com p-quote)
const SHAPE = new Set(['alinea', 'p-quote', 'p-small', 'p-legendas']);
const INLINE_WRAPS = ['b', 'i', 'u', 'sup', 'sub']; // ordem de aninhamento (exterior → interior)

export const isBold = (p: Props) => /bold/.test(p['font-weight'] ?? '') || parseInt(p['font-weight'] ?? '0') >= 600;
export const isItalic = (p: Props) => /italic|oblique/.test(p['font-style'] ?? '');
export const fontEm = (p: Props) => {
    const v = p['font-size'] ?? '1em';
    if (v.endsWith('%')) return parseFloat(v) / 100;
    if (v.endsWith('px')) return parseFloat(v) / 16;
    return parseFloat(v) || 1;
};
// comprimento em `em` do próprio elemento (px convertidos com o corpo do elemento)
const lenEm = (v: string | undefined, p: Props) => {
    if (!v || v === 'auto' || v.endsWith('%')) return 0;
    if (v.endsWith('px')) return parseFloat(v) / (16 * fontEm(p));
    return parseFloat(v) || 0;
};
const BORDER = /solid|double|dashed|dotted/;

// Intenção de um parágrafo a partir do CSS resolvido. `bodySize` = corpo do texto corrente do livro (em).
// ponytail: limiares fixos; o mapa pode forçar classes.
export function intentOf(p: Props, bodySize: number): Intent {
    const a = p['text-align'] ?? 'start';
    const align = a === 'start' || a === 'left' ? 'left' : a === 'end' || a === 'right' ? 'right' : a === 'center' ? 'center' : 'justify';
    const indent = lenEm(p['text-indent'], p), ml = lenEm(p['margin-left'], p);
    const mt = lenEm(p['margin-top'], p), mb = lenEm(p['margin-bottom'], p);
    return {
        align,
        // recuo pendente: longo = alíneas/listas; curto (ex. bibliografia) = parágrafo normal
        indent: indent > 0.05 ? 'first' : indent < -0.05 && ml >= 1.5 ? 'hanging' : 'none',
        block: indent >= -0.05 && ml >= 1,
        above: mt >= 3 ? 'space' : mt >= 0.5 ? 'top' : 'none',
        below: mb >= 0.5,
        small: fontEm(p) / bodySize < 0.95,
        bold: isBold(p), italic: isItalic(p), upper: p['text-transform'] === 'uppercase',
        borderTop: BORDER.test(p['border-top-style'] ?? ''), borderBottom: BORDER.test(p['border-bottom-style'] ?? ''),
    };
}

// O que a tradução promete manter (o resto — corpo, filetes, tipo de recuo — passa para valores do editor)
export function preservedOf(i: Intent) {
    return {
        align: i.align, indent: i.align !== 'center' && i.indent === 'first', above: i.above !== 'none',
        below: i.below, bold: i.bold, italic: i.italic, upper: i.upper,
    };
}

// Classes do editor para a intenção, pela ordem fixa do editor
function editorClasses(i: Intent): string[] {
    const cls: string[] = [];
    if (i.align === 'center') cls.push('p-center');
    else if (i.indent === 'first') cls.push('p-indent');
    if (i.indent === 'hanging') cls.push('alinea');
    else if (i.block) cls.push('p-quote');
    if (i.above === 'space') cls.push('p-space'); else if (i.above === 'top') cls.push('p-top');
    if (i.below) cls.push('p-bottom');
    if (i.bold && i.italic) cls.push('p-bold-italic');
    else if (i.bold) cls.push('p-bold');
    else if (i.italic) cls.push('p-italic');
    if (i.upper) cls.push('p-uppercase');
    if (!cls.includes('p-quote') && i.small) cls.push('p-small');
    if (i.borderTop) cls.push('p-border-top');
    if (i.borderBottom) cls.push('p-border-bottom');
    return cls;
}

const splitTargets = (targets: string[]) => targets.flatMap(t => t.split(/\s+/)).filter(Boolean);

export function translateParagraph(intent: Intent, ctx: ParagraphContext): ParagraphResult {
    const targets = splitTargets(ctx.targets);
    if (targets.includes('__remove__')) return { remove: true };
    const asHeading = targets.find(t => /^h[1-6]$/.test(t)) as BlockTag | undefined;
    // "título" sem letras nem números (ex. "*" num estilo de abertura) = separador do editor, não capítulo
    if (asHeading && !/[\p{L}\p{N}]/u.test(ctx.text) && ctx.text.trim()) return { tag: 'p', classes: ['p-asterisk'] };
    const heading = ctx.frontMatter ? undefined : asHeading; // antes do Índice (rosto/ficha) não há capítulos
    const auto = editorClasses(intent);
    const forced = targets.filter(t => ctx.vocabulary.has(t)); // classes do editor forçadas no mapa
    let classes: string[];
    if (ctx.where !== 'body') classes = [];                              // notas e tabelas: estilo do editor
    else if (heading) classes = auto.filter(c => c === 'p-center');      // títulos: só o alinhamento
    // classes forçadas no mapa substituem só a "forma"; espaços, alinhamento e peso vêm do CSS original
    else classes = forced.length ? [...new Set([...auto.filter(c => !SHAPE.has(c)), ...forced])] : auto;
    if (classes.includes('p-legendas')) classes = classes.filter(c => !['p-small', 'p-bottom', 'p-indent'].includes(c));
    // direita/esquerda: como o editor grava os botões de alinhamento (style inline); títulos à esquerda = padrão
    const side = intent.align === 'left' || intent.align === 'right' ? intent.align : undefined;
    const align = ctx.where === 'body' && side && !(heading && side === 'left') ? side : undefined;
    return { tag: heading ?? 'p', classes, ...(align ? { align } : {}) };
}

// Semântica de um span: só se o efeito existir no CSS original (estilo "Superscript" sem elevação ≠ <sup>).
// `own` = só o que as classes do span mudam face à base (não o herdado).
export function translateSpan(own: Props, rawTargets: string[]): SpanResult {
    const targets = splitTargets(rawTargets);
    if (targets.includes('__remove__')) return { remove: true };
    const real: Record<string, boolean> = {
        b: isBold(own), i: isItalic(own), u: /underline/.test(own['text-decoration'] ?? ''),
        sup: /super/.test(own['vertical-align'] ?? ''), sub: /^sub$/.test(own['vertical-align'] ?? ''),
        'small-caps': /small-caps/.test(own['font-variant'] ?? ''), 'drop-cap': true,
    };
    const sem = targets.filter(t => real[t]);
    return { wraps: INLINE_WRAPS.filter(w => sem.includes(w)), classes: sem.filter(t => t === 'small-caps' || t === 'drop-cap') };
}
