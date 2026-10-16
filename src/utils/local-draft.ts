/**
 * Rascunho local do ebook (IndexedDB): cópia do texto que ainda não foi confirmada pelo servidor.
 * Escreve-se pouco depois de o utilizador parar de escrever; apaga-se quando o save é confirmado.
 * Um rascunho que sobra = save falhou (sem rede, crash do separador) → oferece-se recuperar.
 * Nunca lança: sem IndexedDB (janela privada, bloqueado) o recurso simplesmente não existe.
 */

export interface Draft { html: string; ts: number }

export interface DraftKv {
    get(key: string): Promise<Draft | undefined>;
    set(key: string, value: Draft): Promise<void>;
    del(key: string): Promise<void>;
}

const DB = 'epub-drafts';
const STORE = 'drafts';

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(DB, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
            const db = open.result;
            const req = run(db.transaction(STORE, mode).objectStore(STORE));
            req.onsuccess = () => { db.close(); resolve(req.result); };
            req.onerror = () => { db.close(); reject(req.error); };
        };
    });
}

const idbKv: DraftKv = {
    get: (k) => tx('readonly', (s) => s.get(k)),
    set: (k, v) => tx('readwrite', (s) => s.put(v, k)).then(() => undefined),
    del: (k) => tx('readwrite', (s) => s.delete(k)).then(() => undefined),
};

export function createDrafts(kv: DraftKv) {
    return {
        save: (isbn: string, html: string) =>
            kv.set(isbn, { html, ts: Date.now() }).catch(() => undefined),
        load: (isbn: string) => kv.get(isbn).then((d) => d ?? null).catch(() => null),
        // `onlyIfHtml`: um save confirmado só apaga o rascunho desse mesmo texto — se entretanto
        // se escreveu mais, o rascunho novo tem de ficar.
        clear: async (isbn: string, onlyIfHtml?: string) => {
            try {
                if (onlyIfHtml !== undefined && (await kv.get(isbn))?.html !== onlyIfHtml) return;
                await kv.del(isbn);
            } catch { /* sem IndexedDB */ }
        },
    };
}

export const drafts = createDrafts(idbKv);

/** Só vale oferecer se o rascunho difere do que o servidor já tem (forma enviada no save). */
export function isRecoverable(draft: Draft | null, serverHtml: string | null): draft is Draft {
    return !!draft && !!draft.html && draft.html !== serverHtml;
}
