/**
 * Gravação — ciclo de vida do save de um ebook, sem React.
 *
 * Dono da regra "o que ainda não foi gravado": o texto que o servidor já tem NA FORMA que o save
 * envia (`saved`). Comparar com o texto cru guardado dava sempre diferente (o load normaliza), e
 * cada save escreve uma versão no histórico — abrir e sair sem editar poluía-o.
 *
 * Caminhos de escrita: `save` (manual/estrutural), `autosave` (intervalo), `onOnline` (retry),
 * `exit('app' | 'unload')` (sair do editor / fechar o separador) e o rascunho local (`contentChanged`).
 * O hook só liga isto ao React e à cache; os adapters (transporte, rascunhos, getter do texto)
 * entram por `deps`, por isso os testes correm sem browser nem TinyMCE.
 */
import type { Draft } from '../../utils/local-draft';
import { isRecoverable } from '../../utils/local-draft';

export interface SaverDeps {
    isbn: string;
    /** Texto atual, incluindo a edição ainda presa no debounce do canal. */
    getContent(): string;
    /** Transporte normal (axios). Rejeita se falhar. */
    send(content: string): Promise<void>;
    /** Transporte de saída do separador: keepalive, sem confirmação. */
    sendOnUnload(content: string): void;
    drafts: {
        save(isbn: string, html: string): Promise<void>;
        load(isbn: string): Promise<Draft | null>;
        clear(isbn: string, onlyIfHtml?: string): Promise<void>;
    };
    /** Modo leitura: nunca grava (nem rascunho). */
    readOnly(): boolean;
    onSaved(content: string, notify: boolean): void;
    /** `exit` = falhou a gravar na saída da app (não há UI para avisar). */
    onFailed(notify: boolean, exit: boolean): void;
    onBusy?(busy: boolean): void;
    autosaveMs?: number;
    draftDelayMs?: number;
}

export function createSaver(deps: SaverDeps) {
    const { isbn } = deps;
    let saved: string | null = null;
    let failed = false;
    let inflight = 0;
    let holdDrafts = false; // oferta de recuperação aberta: escrever apagaria o rascunho a recuperar
    let draftTimer: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    let draftChecked = false;

    const busy = (delta: 1 | -1) => {
        inflight += delta;
        deps.onBusy?.(inflight > 0);
    };

    const pending = (): string | null => {
        if (deps.readOnly()) return null;
        const content = deps.getContent();
        return content && content !== saved ? content : null;
    };

    async function send(content: string, notify: boolean, exit = false): Promise<void> {
        busy(1);
        try {
            await deps.send(content);
            saved = content;
            failed = false;
            // Sem edição mais recente: qualquer rascunho (mesmo de um texto anterior ao enviado) ficou para trás.
            // Com edição nova a meio, só o rascunho deste mesmo texto cai — o novo escreve-se a seguir.
            void deps.drafts.clear(isbn, deps.getContent() === content ? undefined : content);
            deps.onSaved(content, notify);
        } catch {
            failed = true;
            deps.onFailed(notify, exit);
        } finally {
            busy(-1);
        }
    }

    const api = {
        /** Linha de base: a primeira forma sincronizada depois do load é o que o servidor tem. */
        baseline() {
            if (saved === null) saved = deps.getContent();
        },

        /** Grava `content` já (manual, estrutural, importação). Não verifica "por gravar". */
        save: (content: string, notify = false) => send(content, notify),

        /** Intervalo: grava se há algo por gravar e nenhum save a decorrer. */
        autosave() {
            const content = pending();
            if (content && inflight === 0) return send(content, false);
        },

        /** Rede de volta: só retoma se o último save falhou. */
        onOnline() {
            if (!failed || inflight > 0) return;
            const content = pending();
            if (content) return send(content, false);
        },

        start() {
            interval = setInterval(() => void api.autosave(), deps.autosaveMs ?? 5 * 60 * 1000);
            return () => api.stop();
        },

        stop() {
            clearInterval(interval);
            clearTimeout(draftTimer);
        },

        /** O texto mudou: (re)agenda o rascunho local para quando assentar. */
        contentChanged() {
            clearTimeout(draftTimer);
            if (holdDrafts || deps.readOnly()) return;
            draftTimer = setTimeout(() => {
                const content = pending();
                if (content) void deps.drafts.save(isbn, content);
            }, deps.draftDelayMs ?? 2000);
        },

        /** Ao abrir (uma vez): devolve o rascunho a oferecer; apaga o que já não difere do servidor. */
        async checkDraft(): Promise<Draft | null> {
            if (draftChecked || deps.readOnly()) return null;
            draftChecked = true;
            const d = await deps.drafts.load(isbn);
            if (isRecoverable(d, saved)) { holdDrafts = true; return d; }
            if (d) void deps.drafts.clear(isbn);
            return null;
        },

        /** Fecha a oferta. `restore`: o rascunho segue como save (que o apaga ao confirmar). */
        resolveDraft(restore: boolean) {
            holdDrafts = false;
            if (!restore) void deps.drafts.clear(isbn);
        },

        /**
         * Sair com texto por gravar. 'app' (voltar, troca de rota): pedido normal, a página
         * continua. 'unload' (fechar/recarregar): keepalive (se couber) + rascunho local. Devolve true se havia algo a gravar
         * (o chamador pede ao browser o aviso de "alterações por gravar").
         */
        exit(kind: 'app' | 'unload'): boolean {
            const content = pending();
            if (!content) return false;
            if (kind === 'unload') {
                if (!holdDrafts) void deps.drafts.save(isbn, content); // o pedido pode não caber/concluir → fica recuperável
                deps.sendOnUnload(content);
            }
            else void send(content, false, true);
            return true;
        },
    };
    return api;
}

export type Saver = ReturnType<typeof createSaver>;
