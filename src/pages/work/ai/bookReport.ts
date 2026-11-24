// O relatório de falhas do livro em texto simples (.txt): junta o que as ferramentas de verificação do assistente encontram — publicação,
// lista de páginas, estilos e figuras contra o PDF, validações — cada falha com a sua localização (capítulo, página do PDF, ficheiro) e um
// excerto do texto. Só lê o livro; quem o pede (a ferramenta build_report) entrega o texto à interface, que o oferece para descarregar.
import { VALIDATION_ORDER, type ValidationKind, type ValidationDigest } from '../../../utils/validation-digest';
import { classEffects } from '../../../utils/css-rule';
import { reviewStyles } from '../../../services/page-list/style-audit';
import { reviewFigures } from '../../../services/page-list/figure-audit';
import { buildChecklist } from './publicationChecklist';
import { WHY } from './tools/checkPageList';
import type { AiWorkspace } from './aiWorkspace';

export interface ReportCounts { publicacao: number; listaDePaginas: number; estilos: number; figuras: number; validacoes: number }
export interface BookReport { text: string; counts: ReportCounts; /** Secções que não se puderam fazer (sem PDF, validação falhou…). */ skipped: string[] }

const VALIDATION_NAMES: Record<ValidationKind, string> = { footnotes: 'Notas de rodapé', links: 'Links', epub: 'EPUBCheck (conformidade EPUB 3.3)', accessibility: 'Acessibilidade (ACE)' };
const STYLE_NAMES = { indent: 'Indentação', emphasis: 'Negrito/itálico', center: 'Centrado', small: 'Letra pequena', spacing: 'Espaço acima' } as const;
const NO_PDF = 'Não há PDF de impressão carregado (ou não foi possível lê-lo): esta secção não foi feita. Carrega-o no painel do PDF.';

const chapterOf = (title: string) => title.replace(/^\[hidden\]/, '').trim() || 'sem capítulo'; // "[hidden]" marca capítulos escondidos do Índice
const quote = (s: string) => `"${s.replace(/\s+/g, ' ').trim()}"`;
const change = (add: string[], remove: string[]) => [add.length && `acrescentar ${add.map((c) => `.${c}`).join(' ')}`, remove.length && `tirar ${remove.map((c) => `.${c}`).join(' ')}`].filter(Boolean).join('; ');

/** Agrupa por `key` mantendo a ordem de primeira aparição. */
function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
    const map = new Map<string, T[]>();
    for (const it of items) (map.get(key(it)) ?? map.set(key(it), []).get(key(it))!).push(it);
    return [...map];
}

export async function buildBookReport(workspace: AiWorkspace, now = new Date()): Promise<BookReport> {
    const counts: ReportCounts = { publicacao: 0, listaDePaginas: 0, estilos: 0, figuras: 0, validacoes: 0 };
    const skipped: string[] = [];
    const sections: string[] = [];
    const add = (title: string, lines: string[]) => sections.push([title, '='.repeat(title.length), ...lines].join('\n'));
    const html = workspace.parts().join('');

    // Publicação: só o que falta ou avisa (o que está ok não é falha).
    const facts = await workspace.publicationFacts();
    const validations: { kind: ValidationKind; digest: ValidationDigest | null }[] = [];
    for (const kind of VALIDATION_ORDER) validations.push({ kind, digest: await workspace.validate(kind) });
    if (facts) {
        const items = buildChecklist(facts, []).filter((i) => i.estado === 'falta' || i.estado === 'aviso');
        counts.publicacao = items.length;
        add('PUBLICAÇÃO', items.length ? items.map((i) => `- ${i.item} [${i.estado}]${i.detalhe ? `: ${i.detalhe}` : ''}${i.resolver ? `\n    Onde resolver: ${i.resolver}` : ''}`) : ['Sem falhas.']);
    } else skipped.push('publicação');

    // Lista de páginas
    const audit = await workspace.pageListAudit();
    if (audit) {
        const real = audit.missing.filter((m) => m.reason === 'fora-de-ordem' || m.reason === 'abre-com-figura');
        counts.listaDePaginas = real.length + audit.orphanMarkers.length;
        const lines = [`${audit.marked} de ${audit.pagesWithFolio} páginas com folio têm marcador.`];
        for (const [reason, ms] of groupBy(audit.missing, (m) => WHY[m.reason])) lines.push(`- Sem marcador (${ms.length}): ${reason}\n    Páginas: ${ms.map((m) => m.page).join(', ')}`);
        if (audit.orphanMarkers.length) lines.push(`- Marcadores sem página no PDF (${audit.orphanMarkers.length}): ${audit.orphanMarkers.join(', ')}`);
        add('LISTA DE PÁGINAS', lines);
    } else { skipped.push('lista de páginas'); add('LISTA DE PÁGINAS', [NO_PDF]); }

    // Estilos e figuras contra o PDF
    const pdf = await workspace.pdfStyles();
    if (pdf) {
        const { diffs, checked, seen } = reviewStyles(html, pdf, undefined, classEffects(workspace.css()));
        counts.estilos = diffs.length;
        const lines = [`${checked} de ${seen} parágrafos soltos encontrados no PDF e comparados (caixas, listas, tabelas, citações, legendas, notas e Índice não se comparam).`];
        for (const [kind, ds] of groupBy(diffs, (d) => d.kind)) {
            lines.push('', `${STYLE_NAMES[kind as keyof typeof STYLE_NAMES]} (${ds.length})`);
            for (const d of ds) lines.push(`- [${chapterOf(d.chapter)} · PDF p. ${d.page}] ${quote(d.text)}\n    ${change(d.add, d.remove)} (${d.why})`);
        }
        if (!diffs.length) lines.push('Sem diferenças.');
        add('ESTILOS (comparados com o PDF)', lines);

        const fig = reviewFigures(html, pdf);
        counts.figuras = fig.diffs.length;
        const figLines = [`${fig.checked} de ${fig.seen} figuras com legenda encontradas no PDF e comparadas (as sem legenda não se comparam).`];
        for (const d of fig.diffs) figLines.push(`- [${chapterOf(d.chapter)} · PDF p. ${d.page}] ${quote(d.caption)}\n    ${d.kind === 'posicao' ? `fora do sítio${d.after ? `: no PDF fica depois de ${quote(d.after)}` : ''}` : 'imagem e legenda trocadas'} (${d.why})${d.fixable ? '' : ' — não se corrige sozinha'}`);
        if (!fig.diffs.length) figLines.push('Sem diferenças.');
        add('FIGURAS (comparadas com o PDF)', figLines);
    } else { skipped.push('estilos e figuras'); add('ESTILOS E FIGURAS (comparados com o PDF)', [NO_PDF]); }

    // Validações: cada grupo com a regra, a contagem, os ficheiros e exemplos do HTML.
    const lines: string[] = [];
    for (const { kind, digest } of validations) {
        if (!digest) { skipped.push(`validação ${kind}`); lines.push(`${VALIDATION_NAMES[kind]}: não foi possível correr (modo leitura ou falhou).`, ''); continue; }
        const n = digest.groups.reduce((s, g) => s + g.count, 0);
        counts.validacoes += n;
        lines.push(`${VALIDATION_NAMES[kind]}: ${n ? `${n} ${n === 1 ? 'problema' : 'problemas'}` : 'sem problemas'}`);
        for (const g of digest.groups) lines.push(`- [${g.severity}${g.impact ? ` · ${g.impact}` : ''}] ${g.rule} (${g.count}): ${g.description}${g.files.length ? `\n    Ficheiros: ${g.files.join(', ')}` : ''}${g.examples.map((e) => `\n    Exemplo: ${e}`).join('')}`);
        if (digest.omittedGroups) lines.push(`- (+${digest.omittedGroups} grupos menos frequentes não listados)`);
        lines.push('');
    }
    add('VALIDAÇÕES', lines.length ? lines : ['Sem dados.']);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const head = [`RELATÓRIO DE FALHAS — ${workspace.title() || 'Livro'}`, `Gerado em ${now.toLocaleString('pt-PT')}`, `Total: ${total} ${total === 1 ? 'falha' : 'falhas'} (publicação ${counts.publicacao}, lista de páginas ${counts.listaDePaginas}, estilos ${counts.estilos}, figuras ${counts.figuras}, validações ${counts.validacoes})`, skipped.length ? `Não feito: ${skipped.join(', ')}` : ''].filter(Boolean).join('\n');
    return { text: `${head}\n\n${sections.join('\n\n')}\n`, counts, skipped };
}
