// Plano da IA sobre o livro: regras (book-rules.ts) e depois operações que o editor já sabe fazer (bookEdit.ts), tudo
// em memória e em sequência. É a MESMA função na simulação (o modelo vê o efeito) e ao aplicar (o que se grava), por
// isso o que o utilizador confirma é o que acontece. Só operações seguras: ficam de fora mover/eliminar/duplicar/criar
// capítulos (mudam os índices a meio do plano) e a page-list (precisa de um PDF).
import { runRules, type BookRule, type RuleReport } from '../../../utils/book-rules';
import { splitChapters, classifyChapterPart } from '../../../utils/chapters';
import { setImageAlts, type AltDecision } from '../../../utils/image-alt-scan';
import { convertSpanStyles } from '../../../utils/inline-styles';
import { applyStylePlan, type PlannedStyle, type PlannedEdit } from '../../../utils/book-styles';
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
    | { type: 'inline_style_to_class'; style: Record<string, string>; cls: string; scope?: string[] };

export interface OpResult { label: string; changed: boolean; summary: string }
export interface PlanResult { html: string; reports: RuleReport[]; opResults: OpResult[]; errors: string[] }

const LABELS: Record<BookOp['type'], string> = {
    drop_caps: 'Capitulares', link_index: 'Ligar Índice', fix_links: 'Corrigir links', replace_text: 'Substituir texto',
    rename_chapter: 'Renomear capítulo', set_chapter_level: 'Nível do capítulo', hide_chapter: 'Capítulo no Índice', set_image_alts: 'Texto alternativo', inline_style_to_class: 'Estilo inline → classe',
};
const LEVELS = ['h1', 'h2', 'h3'];
// `find` casa no HTML cru (replaceInBook): sem marcação nem aspas/atributos, para não tocar em tags; o texto novo também sem tags.
const BAD_FIND = /[<>"&=]/;
const BAD_TEXT = /[<>]/;

const bookOf = (parts: string[]): Book => ({ html: parts.join(''), parts, chapters: parts.map((p, i) => classifyChapterPart(p, i)) });

export function validateOps(ops: BookOp[]): string[] {
    const errors: string[] = [];
    ops.forEach((op, i) => {
        const at = `operação ${i + 1}`;
        if (!op || !(op.type in LABELS)) return errors.push(`${at}: tipo desconhecido`);
        if (op.type === 'replace_text') {
            if (typeof op.find !== 'string' || op.find.length < 2 || op.find.length > 200 || BAD_FIND.test(op.find)) errors.push(`${at}: "find" tem de ter 2–200 caracteres, sem < > " & =`);
            if (typeof op.replace !== 'string' || op.replace.length > 500 || BAD_TEXT.test(op.replace)) errors.push(`${at}: "replace" inválido (sem < >)`);
        }
        if (op.type === 'set_image_alts' && (!Array.isArray(op.items) || op.items.length > 1000 || !op.items.every((d) => typeof d?.id === 'string' && d.id && typeof d.alt === 'string' && d.alt.length <= 300 && !BAD_TEXT.test(d.alt) && (d.overwrite === undefined || typeof d.overwrite === 'boolean')))) errors.push(`${at}: "items" tem de ser uma lista (até 1000) de { id, alt } com alt até 300 caracteres e sem < >`);
        if (op.type === 'inline_style_to_class') {
            const entries = op.style && typeof op.style === 'object' ? Object.entries(op.style) : [];
            if (!entries.length || entries.length > 12 || !entries.every(([k, v]) => /^[a-z][a-z-]*$/.test(k) && typeof v === 'string' && v.length <= 60 && !BAD_TEXT.test(v))) errors.push(`${at}: "style" tem de ser { propriedade: valor } (até 12, sem < >)`);
            if (typeof op.cls !== 'string' || !/^[a-z][a-z0-9-]*$/.test(op.cls) || op.cls.startsWith('chapter-')) errors.push(`${at}: "cls" inválida`);
            if (op.scope !== undefined && (!Array.isArray(op.scope) || !op.scope.every((t) => /^[a-z][a-z0-9]*$/.test(t)))) errors.push(`${at}: "scope" tem de ser uma lista de tags (ex. ["h1"])`);
        }
        if ('index' in op && !Number.isInteger(op.index)) errors.push(`${at}: "index" tem de ser um inteiro`);
        if (op.type === 'rename_chapter' && (typeof op.title !== 'string' || !op.title.trim() || op.title.length > 200 || BAD_TEXT.test(op.title))) errors.push(`${at}: título inválido`);
        if (op.type === 'set_chapter_level' && !LEVELS.includes(op.level)) errors.push(`${at}: nível tem de ser h1, h2 ou h3`);
        if (op.type === 'hide_chapter' && typeof op.hidden !== 'boolean') errors.push(`${at}: "hidden" tem de ser true ou false`);
    });
    return errors;
}

type Step = { html?: string; summary: string; error?: string };
const fromEdit = (edit: BookEdit | null): Step => {
    if (edit?.notice?.type === 'error') return { summary: '', error: edit.notice.text };
    return edit?.html === undefined ? { summary: edit?.notice?.text ?? 'Sem alterações' } : { html: edit.html, summary: edit.notice?.text ?? 'Feito' };
};

function runOp(book: Book, op: BookOp, known?: ReadonlySet<string>): Step {
    const at = 'index' in op ? book.chapters[op.index] : null;
    if ('index' in op && !at) return { summary: '', error: `não há capítulo ${op.index} (0–${book.chapters.length - 1})` };
    switch (op.type) {
        case 'drop_caps': return fromEdit(bookEdit.applyDropCaps(book));
        case 'link_index': return fromEdit(bookEdit.linkIndice(book));
        case 'fix_links': return fromEdit(bookEdit.fixBookLinks(book).edit);
        case 'replace_text': {
            const { edit, count } = bookEdit.replaceInBook(book, op.find, op.replace);
            return edit?.html === undefined ? { summary: 'Texto não encontrado' } : { html: edit.html, summary: `${count} ${count === 1 ? 'ocorrência' : 'ocorrências'}` };
        }
        case 'rename_chapter': {
            const step = fromEdit(bookEdit.renameChapter(book, op.index, op.title.trim()));
            return step.html === undefined ? { summary: 'Título igual' } : { ...step, summary: `${at!.title} → ${op.title.trim()}` };
        }
        case 'set_chapter_level': {
            const step = fromEdit(bookEdit.changeLevel(book, op.index, op.level));
            return step.html === undefined ? { summary: 'Já tem esse nível' } : { ...step, summary: `${at!.title}: ${op.level}` };
        }
        case 'inline_style_to_class': {
            if (known && !known.has(op.cls)) return { summary: '', error: `a classe "${op.cls}" não existe: cria o estilo em "styles" (kind "char") na mesma proposta` };
            const { parts, changed } = convertSpanStyles(book.parts, { style: op.style, cls: op.cls, scope: op.scope });
            return changed === 0 ? { summary: 'Nenhum span com esse estilo' } : { html: parts.join(''), summary: `${changed} ${changed === 1 ? 'span passa' : 'spans passam'} a .${op.cls}${op.scope ? ` (em ${op.scope.join(', ')})` : ''}` };
        }
        case 'set_image_alts': {
            const { parts, changed } = setImageAlts(book.parts, op.items);
            return changed === 0 ? { summary: 'Sem imagens por escrever' } : { html: parts.join(''), summary: `${changed} ${changed === 1 ? 'imagem' : 'imagens'}` };
        }
        case 'hide_chapter': {
            if ((at!.level === 'break') === op.hidden) return { summary: op.hidden ? 'Já está escondido' : 'Já está visível' };
            const step = fromEdit(bookEdit.toggleHidden(book, op.index));
            return step.html === undefined ? step : { ...step, summary: `${at!.title}: ${op.hidden ? 'escondido do Índice' : 'visível no Índice'}` };
        }
    }
}

export function runPlan(parts: string[], rules: BookRule[], ops: BookOp[], known?: ReadonlySet<string>): PlanResult {
    const opErrors = validateOps(ops);
    const run = runRules(parts, rules, known);
    const errors = [...run.errors, ...opErrors];
    if (errors.length) return { html: parts.join(''), reports: run.reports, opResults: [], errors };

    let html = run.parts.join('');
    let book = bookOf(run.parts);
    const opResults: OpResult[] = [];
    ops.forEach((op, i) => {
        const step = runOp(book, op, known);
        if (step.error) { errors.push(`operação ${i + 1}: ${step.error}`); return; }
        opResults.push({ label: LABELS[op.type], changed: step.html !== undefined && step.html !== html, summary: step.summary });
        if (step.html !== undefined && step.html !== html) { html = step.html; book = bookOf(splitChapters(html)); }
    });
    return { html, reports: run.reports, opResults, errors };
}

export interface AiPlanInput { rules: BookRule[]; ops: BookOp[]; styles: PlannedStyle[]; edits: PlannedEdit[] }

/**
 * O resultado COMPLETO de um plano (HTML e CSS), calculado sem tocar em nada: quem aplica só grava depois de ver `errors`
 * vazio, por isso nunca fica o HTML alterado e o CSS não (ou ao contrário).
 */
export function resolvePlan(parts: string[], css: string, plan: AiPlanInput): { html: string; css: string; errors: string[] } {
    const run = runPlan(parts, plan.rules, plan.ops);
    const styled = applyStylePlan(css, plan.styles, plan.edits);
    const errors = [...run.errors, ...styled.errors];
    return errors.length ? { html: parts.join(''), css, errors } : { html: run.html, css: styled.css, errors };
}

/** Os ficheiros do histórico guardados ao aplicar um plano (para o poder repor): o HTML só se mudou, o CSS só se mudou. */
export interface AiSnapshots { htmlFile?: string; cssFile?: string }
