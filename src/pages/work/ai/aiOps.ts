// O catálogo das operações do plano (aiPlan.ts): UMA entrada por operação com o rótulo, a validação e a execução juntos.
// `OPS` é um Record sobre os tipos de `BookOp`: acrescentar uma operação ao tipo obriga (o compilador) a descrevê-la aqui por inteiro.
// O texto que explica as operações ao modelo continua em server/routes/ai.js; server/ai-contract.test.js verifica que as cobre todas.
import type { RuleReport } from '../../../utils/book-rules';
import { setImageAlts, type AltDecision } from '../../../utils/image-alt-scan';
import { convertSpanStyles } from '../../../utils/inline-styles';
import { fixTypography, TYPOGRAPHY_FIXES, type TypographyFix } from '../../../utils/typography';
import { fillMissingPageBreaks, type PageLines } from '../../../services/page-list/alignment';
import { reviewStyles, STYLE_KINDS, type StyleKind } from '../../../services/page-list/style-audit';
import { reviewFigures } from '../../../services/page-list/figure-audit';
import type { PdfStyles } from '../../../services/page-list/pdf-styles';
import * as bookEdit from '../bookEdit';
import type { Book, BookEdit } from '../bookEdit';

export type BookOp =
    | { type: 'drop_caps' }
    | { type: 'link_index' }
    | { type: 'fix_links' }
    | { type: 'replace_text'; find: string; replace: string }
    | { type: 'rename_chapter'; index: number; title: string }
    | { type: 'set_chapter_level'; index: number; level: 'h1' | 'h2' | 'h3' }
    | { type: 'hide_chapter'; index: number; hidden: boolean }
    | { type: 'set_image_alts'; items: AltDecision[] }
    | { type: 'inline_style_to_class'; style: Record<string, string>; cls: string; scope?: string[] }
    | { type: 'typography'; fixes?: TypographyFix[] }
    | { type: 'fix_page_list'; pages?: PageLines[] } // `pages` não é do modelo: a ferramenta preenche-o a partir do PDF
    | { type: 'fix_styles'; kinds?: StyleKind[]; pdf?: PdfStyles } // idem `pdf`
    | { type: 'fix_figures'; pdf?: PdfStyles };

export interface OpResult { label: string; changed: boolean; summary: string }
export interface PlanResult { html: string; reports: RuleReport[]; opResults: OpResult[]; errors: string[] }

export type Step = { html?: string; summary: string; error?: string };
type OpOf<K extends BookOp['type']> = Extract<BookOp, { type: K }>;
interface OpDef<K extends BookOp['type']> {
    label: string;
    /** Erros do que o modelo pôs na operação (`at` = "operação N"); sem `validate` não há nada a validar. */
    validate?(op: OpOf<K>, at: string): string[];
    /** `at` = o capítulo de `op.index` (só nas operações com `index`; já verificado que existe). */
    run(book: Book, op: OpOf<K>, at: Book['chapters'][number] | null, known?: ReadonlySet<string>): Step;
}

const LEVELS = ['h1', 'h2', 'h3'];
// `find` casa no HTML cru (replaceInBook): sem marcação nem aspas/atributos, para não tocar em tags; o texto novo também sem tags.
const BAD_FIND = /[<>"&=]/;
const BAD_TEXT = /[<>]/;

const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
const okLine = (l: PdfStyles['pages'][number]['lines'][number]) => typeof l?.key === 'string' && [l.x0, l.x1, l.y, l.size].every(finite) && typeof l.bold === 'boolean' && typeof l.italic === 'boolean';
const okImage = (b: { x0: number; y0: number; x1: number; y1: number }) => [b?.x0, b?.y0, b?.x1, b?.y1].every(finite);
/** Os dados do PDF que fix_styles/fix_figures trazem dentro da operação (a ferramenta mete-os; o modelo nunca os vê). */
const validPdf = (pdf: PdfStyles | undefined): boolean => !!pdf && finite(pdf.body) && Array.isArray(pdf.pages) && pdf.pages.length <= 2000
    && pdf.pages.every((p) => [p?.left, p?.right, p?.gap].every(finite) && Array.isArray(p.lines) && p.lines.length <= 300 && p.lines.every(okLine) && (p.images === undefined || (Array.isArray(p.images) && p.images.length <= 50 && p.images.every(okImage))));
const NO_PDF = (at: string) => `${at}: sem os dados do PDF de impressão (carrega o PDF no painel do PDF)`;

const fromEdit = (edit: BookEdit | null): Step => {
    if (edit?.notice?.type === 'error') return { summary: '', error: edit.notice.text };
    return edit?.html === undefined ? { summary: edit?.notice?.text ?? 'Sem alterações' } : { html: edit.html, summary: edit.notice?.text ?? 'Feito' };
};

export const OPS: { [K in BookOp['type']]: OpDef<K> } = {
    drop_caps: { label: 'Capitulares', run: (book) => fromEdit(bookEdit.applyDropCaps(book)) },
    link_index: { label: 'Ligar Índice', run: (book) => fromEdit(bookEdit.linkIndice(book)) },
    fix_links: { label: 'Corrigir links', run: (book) => fromEdit(bookEdit.fixBookLinks(book).edit) },
    replace_text: {
        label: 'Substituir texto',
        validate: (op, at) => {
            const errors: string[] = [];
            if (typeof op.find !== 'string' || op.find.length < 2 || op.find.length > 200 || BAD_FIND.test(op.find)) errors.push(`${at}: "find" tem de ter 2–200 caracteres, sem < > " & =`);
            if (typeof op.replace !== 'string' || op.replace.length > 500 || BAD_TEXT.test(op.replace)) errors.push(`${at}: "replace" inválido (sem < >)`);
            return errors;
        },
        run: (book, op) => {
            const { edit, count } = bookEdit.replaceInBook(book, op.find, op.replace);
            return edit?.html === undefined ? { summary: 'Texto não encontrado' } : { html: edit.html, summary: `${count} ${count === 1 ? 'ocorrência' : 'ocorrências'}` };
        },
    },
    rename_chapter: {
        label: 'Renomear capítulo',
        validate: (op, at) => (typeof op.title !== 'string' || !op.title.trim() || op.title.length > 200 || BAD_TEXT.test(op.title) ? [`${at}: título inválido`] : []),
        run: (book, op, at) => {
            const step = fromEdit(bookEdit.renameChapter(book, op.index, op.title.trim()));
            return step.html === undefined ? { summary: 'Título igual' } : { ...step, summary: `${at!.title} → ${op.title.trim()}` };
        },
    },
    set_chapter_level: {
        label: 'Nível do capítulo',
        validate: (op, at) => (!LEVELS.includes(op.level) ? [`${at}: nível tem de ser h1, h2 ou h3`] : []),
        run: (book, op, at) => {
            const step = fromEdit(bookEdit.changeLevel(book, op.index, op.level));
            return step.html === undefined ? { summary: 'Já tem esse nível' } : { ...step, summary: `${at!.title}: ${op.level}` };
        },
    },
    hide_chapter: {
        label: 'Capítulo no Índice',
        validate: (op, at) => (typeof op.hidden !== 'boolean' ? [`${at}: "hidden" tem de ser true ou false`] : []),
        run: (book, op, at) => {
            if ((at!.level === 'break') === op.hidden) return { summary: op.hidden ? 'Já está escondido' : 'Já está visível' };
            const step = fromEdit(bookEdit.toggleHidden(book, op.index));
            return step.html === undefined ? step : { ...step, summary: `${at!.title}: ${op.hidden ? 'escondido do Índice' : 'visível no Índice'}` };
        },
    },
    set_image_alts: {
        label: 'Texto alternativo',
        validate: (op, at) => (!Array.isArray(op.items) || op.items.length > 1000 || !op.items.every((d) => typeof d?.id === 'string' && d.id && typeof d.alt === 'string' && d.alt.length <= 300 && !BAD_TEXT.test(d.alt) && (d.overwrite === undefined || typeof d.overwrite === 'boolean'))
            ? [`${at}: "items" tem de ser uma lista (até 1000) de { id, alt } com alt até 300 caracteres e sem < >`] : []),
        run: (book, op) => {
            const { parts, changed } = setImageAlts(book.parts, op.items);
            return changed === 0 ? { summary: 'Sem imagens por escrever' } : { html: parts.join(''), summary: `${changed} ${changed === 1 ? 'imagem' : 'imagens'}` };
        },
    },
    inline_style_to_class: {
        label: 'Estilo inline → classe',
        validate: (op, at) => {
            const errors: string[] = [];
            const entries = op.style && typeof op.style === 'object' ? Object.entries(op.style) : [];
            if (!entries.length || entries.length > 12 || !entries.every(([k, v]) => /^[a-z][a-z-]*$/.test(k) && typeof v === 'string' && v.length <= 60 && !BAD_TEXT.test(v))) errors.push(`${at}: "style" tem de ser { propriedade: valor } (até 12, sem < >)`);
            if (typeof op.cls !== 'string' || !/^[a-z][a-z0-9-]*$/.test(op.cls) || op.cls.startsWith('chapter-')) errors.push(`${at}: "cls" inválida`);
            if (op.scope !== undefined && (!Array.isArray(op.scope) || !op.scope.every((t) => /^[a-z][a-z0-9]*$/.test(t)))) errors.push(`${at}: "scope" tem de ser uma lista de tags (ex. ["h1"])`);
            return errors;
        },
        run: (book, op, _at, known) => {
            if (known && !known.has(op.cls)) return { summary: '', error: `a classe "${op.cls}" não existe: cria o estilo em "styles" (kind "char") na mesma proposta` };
            const { parts, changed } = convertSpanStyles(book.parts, { style: op.style, cls: op.cls, scope: op.scope });
            return changed === 0 ? { summary: 'Nenhum span com esse estilo' } : { html: parts.join(''), summary: `${changed} ${changed === 1 ? 'span passa' : 'spans passam'} a .${op.cls}${op.scope ? ` (em ${op.scope.join(', ')})` : ''}` };
        },
    },
    typography: {
        label: 'Tipografia',
        validate: (op, at) => (op.fixes !== undefined && (!Array.isArray(op.fixes) || !op.fixes.length || !op.fixes.every((f) => (TYPOGRAPHY_FIXES as readonly string[]).includes(f)))
            ? [`${at}: "fixes" tem de ser uma lista de ${TYPOGRAPHY_FIXES.join('/')}`] : []),
        run: (book, op) => {
            const { parts, counts, skippedQuotes, sample } = fixTypography(book.parts, op.fixes);
            const NAMES: Record<TypographyFix, string> = { quotes: 'aspas', dashes: 'travessões', ellipsis: 'reticências', spaces: 'espaços' };
            const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);
            if (total === 0) return { summary: skippedQuotes ? `Nada a corrigir (${skippedQuotes} blocos com aspas desemparelhadas ficaram como estavam)` : 'Nada a corrigir' };
            const what = TYPOGRAPHY_FIXES.filter((k) => counts[k]).map((k) => `${NAMES[k]} ${counts[k]}`).join(', ');
            const note = skippedQuotes ? `; ${skippedQuotes} blocos com aspas desemparelhadas ficaram como estavam` : '';
            return { html: parts.join(''), summary: `${total} alterações (${what})${note}${sample ? `. Ex.: ${sample.before} → ${sample.after}` : ''}` };
        },
    },
    fix_page_list: {
        label: 'Lista de páginas',
        validate: (op, at) => (!Array.isArray(op.pages) || op.pages.length > 2000 || !op.pages.every((d) => Number.isInteger(d?.page) && Array.isArray(d.lines) && d.lines.length <= 12 && d.lines.every((l) => typeof l === 'string' && l.length <= 80)) ? [NO_PDF(at)] : []),
        run: (book, op) => {
            const { html, inserted } = fillMissingPageBreaks(book.html, op.pages ?? []);
            if (!inserted.length) return { summary: 'Nenhum marcador para inserir (as que faltam são em branco, só figura, ou já não cabem entre os vizinhos)' };
            return { html, summary: `${inserted.length} ${inserted.length === 1 ? 'marcador inserido' : 'marcadores inseridos'}: páginas ${inserted.join(', ')}` };
        },
    },
    fix_styles: {
        label: 'Estilos segundo o PDF',
        validate: (op, at) => {
            const errors: string[] = [];
            if (op.kinds !== undefined && (!Array.isArray(op.kinds) || !op.kinds.length || !op.kinds.every((k) => (STYLE_KINDS as readonly string[]).includes(k)))) errors.push(`${at}: "kinds" tem de ser uma lista de ${STYLE_KINDS.join('/')}`);
            if (!validPdf(op.pdf)) errors.push(NO_PDF(at));
            return errors;
        },
        run: (book, op) => {
            const { html, diffs } = reviewStyles(book.html, op.pdf!, op.kinds);
            if (!diffs.length) return { summary: 'O estilo dos parágrafos já bate com o PDF (nos que se encontraram nele)' };
            const NAMES: Record<StyleKind, string> = { indent: 'indentação', emphasis: 'negrito/itálico', center: 'centrado', small: 'letra pequena', spacing: 'espaço acima' };
            const what = STYLE_KINDS.map((k) => [k, diffs.filter((d) => d.kind === k).length] as const).filter(([, n]) => n).map(([k, n]) => `${NAMES[k]} ${n}`).join(', ');
            return { html, summary: `${diffs.length} ${diffs.length === 1 ? 'parágrafo corrigido' : 'correções'} (${what})` };
        },
    },
    fix_figures: {
        label: 'Figuras segundo o PDF',
        validate: (op, at) => (!validPdf(op.pdf) ? [NO_PDF(at)] : []),
        run: (book, op) => {
            const { html, diffs } = reviewFigures(book.html, op.pdf!);
            if (!diffs.some((d) => d.fixable)) return { summary: 'As figuras já estão onde o PDF as tem (nas que se encontraram nele)' };
            const moved = diffs.filter((d) => d.kind === 'posicao' && d.fixable).length, swapped = diffs.filter((d) => d.kind === 'ordem').length;
            return { html, summary: [moved && `${moved} ${moved === 1 ? 'figura movida' : 'figuras movidas'}`, swapped && `${swapped} ${swapped === 1 ? 'legenda trocada' : 'legendas trocadas'} com a imagem`].filter(Boolean).join(', ') };
        },
    },
};

/** Os tipos de operação (completo por construção: OPS é um Record). Ver server/ai-contract.test.js. */
export const OP_TYPES = Object.keys(OPS);

type AnyDef = { label: string; validate?(op: BookOp, at: string): string[]; run(book: Book, op: BookOp, at: Book['chapters'][number] | null, known?: ReadonlySet<string>): Step };
const def = (type: BookOp['type']) => OPS[type] as unknown as AnyDef; // o Record garante que cada `type` casa com a sua entrada

export const opLabel = (op: BookOp): string => def(op.type).label;

export function validateOps(ops: BookOp[]): string[] {
    const errors: string[] = [];
    ops.forEach((op, i) => {
        const at = `operação ${i + 1}`;
        if (!op || !(op.type in OPS)) return errors.push(`${at}: tipo desconhecido`);
        if ('index' in op && !Number.isInteger(op.index)) errors.push(`${at}: "index" tem de ser um inteiro`);
        errors.push(...(def(op.type).validate?.(op, at) ?? []));
    });
    return errors;
}

export function runOp(book: Book, op: BookOp, known?: ReadonlySet<string>): Step {
    const at = 'index' in op ? book.chapters[op.index] : null;
    if ('index' in op && !at) return { summary: '', error: `não há capítulo ${op.index} (0–${book.chapters.length - 1})` };
    return def(op.type).run(book, op, at, known);
}
