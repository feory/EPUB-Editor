// O relatório de validação (ACE ou EPUBCheck) condensado para o modelo da IA: agrupado por regra, com contagem, gravidade,
// ficheiros e poucos exemplos de HTML. Um livro grande tem centenas de entradas repetidas; assim cabe em poucos tokens.
// O texto do livro não vai: só mensagens de erro e o HTML do elemento com problema (curto).
import type { ValidationResult } from '../api/ebooks-api';
import type { ValidationReport } from '../services/validation/footnote-validator';
import type { LinkReport } from '../services/validation/link-validator';

/** As validações do editor, pela ordem em que `all` as corre: as rápidas (no editor) primeiro, depois as que geram o EPUB. */
export const VALIDATION_ORDER = ['footnotes', 'links', 'epub', 'accessibility'] as const;
export type ValidationKind = typeof VALIDATION_ORDER[number];

export interface ValidationDigest {
    source: string;
    valid: boolean;
    groups: { rule: string; severity: 'erro' | 'aviso'; impact?: string; count: number; description: string; files: string[]; examples: string[] }[];
    /** Grupos que ficaram de fora (os menos frequentes). */
    omittedGroups: number;
}

const MAX_GROUPS = 25;
const MAX_FILES = 5;
const MAX_EXAMPLES = 2;
const EXAMPLE_LEN = 200;
const SOURCE: Record<ValidationKind, string> = { footnotes: 'Notas de rodapé', links: 'Links', epub: 'EPUBCheck (conformidade EPUB 3.3)', accessibility: 'ACE (acessibilidade WCAG)' };

export function digestValidation(result: ValidationResult, kind: ValidationKind): ValidationDigest {
    const byRule = new Map<string, ValidationDigest['groups'][number]>();
    const add = (issues: ValidationResult['errors'], severity: 'erro' | 'aviso') => {
        for (const issue of issues) {
            const rule = issue.rule || issue.message.slice(0, 60);
            const key = `${severity}|${rule}`;
            const g = byRule.get(key) ?? { rule, severity, impact: issue.impact, count: 0, description: (issue.description || issue.message).slice(0, 200), files: [], examples: [] };
            g.count++;
            if (issue.file && !g.files.includes(issue.file) && g.files.length < MAX_FILES) g.files.push(issue.file);
            const html = issue.html?.replace(/\s+/g, ' ').trim().slice(0, EXAMPLE_LEN);
            if (html && !g.examples.includes(html) && g.examples.length < MAX_EXAMPLES) g.examples.push(html);
            byRule.set(key, g);
        }
    };
    add(result.errors, 'erro');
    add(result.warnings, 'aviso');
    const groups = [...byRule.values()].sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === 'erro' ? -1 : 1));
    return { source: SOURCE[kind], valid: result.valid, groups: groups.slice(0, MAX_GROUPS), omittedGroups: Math.max(0, groups.length - MAX_GROUPS) };
}

/** As validações que só olham para o HTML (notas e links) têm uma lista simples de problemas: vira o mesmo resumo, agrupado por tipo. */
const fromIssues = (kind: 'footnotes' | 'links', issues: { type: string; message: string; context?: string }[]): ValidationDigest =>
    digestValidation({ valid: issues.length === 0, errors: [], warnings: issues.map((i) => ({ message: i.message, rule: i.type, html: i.context })) }, kind);

export const digestFootnotes = (report: ValidationReport) => fromIssues('footnotes', report.issues);
export const digestLinks = (report: LinkReport) => fromIssues('links', report.issues);
