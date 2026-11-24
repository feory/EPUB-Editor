// Quem segue quem entre o PDF de impressão e o editor, como uma função pura: um evento + o estado do leitor → o que mover. O leitor
// (PrintPdfSidebar) só desenha e aplica a ação; as regras ("o PDF segue o editor, salvo no modo livre, salvo salto explícito") vivem aqui.
import { nearestPdfPage } from './nearest-page';

export interface SyncState {
    /** Modo livre: nem o editor move o PDF nem o PDF move o editor. */
    free: boolean;
    /** O PDF está aberto (carregado e pronto a mostrar páginas). */
    ready: boolean;
    pageCount: number;
    /** O mapa folio↔página já foi lido? (só existe depois de ler o texto do PDF) */
    mapsReady: boolean;
    folioToPage: ReadonlyMap<number, number>;
    pageToFolio: ReadonlyMap<number, number>;
}

export type SyncEvent =
    | { type: 'editorAt'; folio: number | null }                 // o editor passou a mostrar este folio
    | { type: 'opened'; editorFolio: number | null }             // o PDF acabou de carregar: abre onde o editor está
    | { type: 'stepped'; page: number }                          // o utilizador mudou de página no PDF (setas, campo)
    | { type: 'clicked'; page: number }                          // clique na página ("localizar no editor"): segue sempre
    | { type: 'jump'; to: { pdf: number } | { folio: number } };  // pedido explícito (botões de página do assistente): segue sempre

/** `page` = a página do PDF a mostrar; `editorFolio` = o folio a que levar o editor. Cada um só vem quando há que mexer. */
export interface SyncAction { page?: number; editorFolio?: number }

const clamp = (s: SyncState, page: number) => Math.min(Math.max(1, page), s.pageCount || 1);
const showing = (s: SyncState, folio: number): SyncAction => {
    const page = nearestPdfPage(s.folioToPage, folio);
    return page === undefined ? {} : { page };
};
/** O editor vai para o folio da página, se ela tem um (o front matter sem numeração não tem). */
const follow = (s: SyncState, page: number): SyncAction => {
    const folio = s.pageToFolio.get(page);
    return folio === undefined ? {} : { editorFolio: folio };
};

export function syncAction(s: SyncState, e: SyncEvent): SyncAction {
    switch (e.type) {
        case 'editorAt': return s.ready && !s.free && e.folio !== null ? showing(s, e.folio) : {};
        case 'opened': return e.editorFolio !== null ? showing(s, e.editorFolio) : {};
        case 'stepped': { const page = clamp(s, e.page); return { page, ...(s.free ? {} : follow(s, page)) }; }
        case 'clicked': { const page = clamp(s, e.page); return { page, ...follow(s, page) }; }
        case 'jump': {
            if (!s.ready) return {};
            const shown = 'folio' in e.to ? showing(s, e.to.folio) : { page: clamp(s, e.to.pdf) };
            const folio = 'folio' in e.to ? e.to.folio : s.pageToFolio.get(shown.page!);
            // o mapa pode ainda não existir (o pedido chega antes): só o PDF se move; o editor segue quando o mapa ficar pronto (o leitor volta a pedir)
            return { ...shown, ...(s.mapsReady && folio !== undefined ? { editorFolio: folio } : {}) };
        }
    }
}
