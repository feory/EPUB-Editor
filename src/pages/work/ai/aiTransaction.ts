// Aplicar e reverter alterações da IA como UMA transação, sem React nem rede. A regra que importa vive aqui, num só sítio:
// nada muda enquanto houver algo que possa falhar (calcular o plano, guardar as versões anteriores, ler o que se vai repor);
// só depois o CSS e o HTML entram juntos, em seguida e de forma síncrona. O que muda de sítio (histórico, livro, CSS) entra por
// "ports": axios e o editor em produção, fakes em memória nos testes (ver aiTransaction.test.ts).
import { resolvePlan, type AiPlanInput, type AiSnapshots, type AiCssSide } from './aiPlan';

/** O histórico do livro: versões do HTML e do CSS e o registo das alterações. Cada função rejeita se falhar. */
export interface AiHistoryPort {
    /** Guarda uma versão do HTML. Devolve o nome do ficheiro (se igual à última, o dessa), ou undefined. */
    saveHtml(html: string): Promise<string | undefined>;
    labelHtml(filename: string, label: string): Promise<void>;
    /** Guarda uma versão do CSS (sempre nova). Devolve o nome do ficheiro. */
    saveCss(css: string, label: string): Promise<string>;
    readHtml(filename: string): Promise<string>;
    readCss(filename: string): Promise<string>;
    record(entry: { request: string; lines: string[]; htmlFile?: string; cssFile?: string }): Promise<void>;
    /** `restore`: os ficheiros do estado de antes de reverter, para depois se poder repor. */
    markReverted(id: string, restore: { htmlFile?: string; cssFile?: string }): Promise<void>;
    markRestored(id: string): Promise<void>;
}

/** O livro no editor. `commit` troca o conteúdo; 'keep' mantém o capítulo ativo, 'reset' recarrega sem capítulo ativo. */
export interface AiBookPort {
    parts(): string[];
    html(): string;
    commit(html: string, mode: 'keep' | 'reset'): void;
}

export type ApplyResult =
    | { status: 'invalid'; errors: string[] }
    | { status: 'nothing' }
    | { status: 'applied'; snapshots: AiSnapshots };

/** O mínimo de uma alteração registada que o Reverter precisa. */
export interface RevertTarget { id: string; request: string; htmlFile?: string; cssFile?: string; restoreHtmlFile?: string; restoreCssFile?: string }

const labelOf = (prefix: string, request: string) => `${prefix}: ${request}`.slice(0, 80);

export function createAiTransactions(ports: { history: AiHistoryPort; book: AiBookPort }) {
    const { history, book } = ports;

    /**
     * Aplica um plano. Rejeita (sem ter tocado em nada) se gravar uma versão anterior falhar; um plano inválido ou sem efeito
     * devolve-se como resultado. O registo (para o Reverter) é depois de aplicado: se falhar só se perde o registo.
     */
    async function apply(plan: AiPlanInput, request: string, css: AiCssSide, summary: string[] = []): Promise<ApplyResult> {
        const currentHtml = book.html();
        const currentCss = css.get();
        const result = resolvePlan(book.parts(), currentCss, plan);
        if (result.errors.length) return { status: 'invalid', errors: result.errors };
        const htmlChanged = result.html !== currentHtml;
        const cssChanged = result.css !== currentCss;
        if (!htmlChanged && !cssChanged) return { status: 'nothing' };

        const label = labelOf('Antes de IA', request);
        const snapshots: AiSnapshots = {};
        if (htmlChanged) {
            const file = await history.saveHtml(currentHtml);
            if (file) { await history.labelHtml(file, label); snapshots.htmlFile = file; }
        }
        if (cssChanged) snapshots.cssFile = await history.saveCss(currentCss, label);

        // Daqui para baixo é tudo síncrono: o CSS e o HTML entram juntos.
        if (cssChanged) css.set(result.css);
        if (htmlChanged) book.commit(result.html, 'keep');
        try { await history.record({ request, lines: summary, ...snapshots }); } catch (e) { console.error('[ai-changes] registo falhou:', e); }
        return { status: 'applied', snapshots };
    }

    /**
     * Repõe o livro para os ficheiros dados. Guarda primeiro o estado atual (também se desfaz) e lê tudo o que vai repor ANTES
     * de tocar em nada. Repõe o LIVRO inteiro: o que se editou depois perde-se (fica no histórico). Rejeita se falhar antes de
     * repor. Devolve os ficheiros do estado que acabou de guardar (o que se perdeu), para o poder repor.
     */
    async function rewind(files: { htmlFile?: string; cssFile?: string }, label: string, css: AiCssSide): Promise<{ htmlFile?: string; cssFile?: string }> {
        const saved: { htmlFile?: string; cssFile?: string } = {};
        if (files.htmlFile) {
            const file = await history.saveHtml(book.html());
            if (file && file !== files.htmlFile) await history.labelHtml(file, label); // não trocar a etiqueta do ficheiro que se vai repor
            saved.htmlFile = file;
        }
        if (files.cssFile) saved.cssFile = await history.saveCss(css.get(), label);

        const html = files.htmlFile ? await history.readHtml(files.htmlFile) : null;
        const cssText = files.cssFile ? await history.readCss(files.cssFile) : null;

        if (cssText !== null) css.set(cssText);
        if (html !== null) book.commit(html, 'reset');
        return saved;
    }

    /** Repõe o HTML e/ou o CSS de antes de uma alteração. Se só falhar marcá-la como revertida, já está revertida e só se perde a marca. */
    async function revert(change: RevertTarget, css: AiCssSide): Promise<void> {
        const saved = await rewind(change, labelOf('Antes de reverter', change.request), css);
        try { await history.markReverted(change.id, saved); } catch (e) { console.error('[ai-changes] marcar como revertida falhou:', e); }
    }

    /** Desfaz o Reverter: repõe o estado que o livro tinha quando foi revertido (a alteração volta a estar aplicada). */
    async function restore(change: RevertTarget, css: AiCssSide): Promise<void> {
        await rewind({ htmlFile: change.restoreHtmlFile, cssFile: change.restoreCssFile }, labelOf('Antes de repor', change.request), css);
        try { await history.markRestored(change.id); } catch (e) { console.error('[ai-changes] marcar como reposta falhou:', e); }
    }

    return { apply, revert, restore };
}
