import { test, expect } from 'bun:test';
import { syncAction, type SyncState } from './pdf-sync';

// 10 páginas; as páginas 1-2 são front matter sem folio; a página 3 tem o folio 1, a 4 o 2… (folio = página - 2)
const maps = (): Pick<SyncState, 'folioToPage' | 'pageToFolio'> => {
    const folioToPage = new Map<number, number>(), pageToFolio = new Map<number, number>();
    for (let page = 3; page <= 10; page++) { folioToPage.set(page - 2, page); pageToFolio.set(page, page - 2); }
    return { folioToPage, pageToFolio };
};
const state = (over: Partial<SyncState> = {}): SyncState => ({ free: false, ready: true, pageCount: 10, mapsReady: true, ...maps(), ...over });

test('o editor passou a um folio: o PDF mostra a página dele (a mais próxima se não há exata); no modo livre ou sem PDF não faz nada', () => {
    expect(syncAction(state(), { type: 'editorAt', folio: 3 })).toEqual({ page: 5 });
    expect(syncAction(state(), { type: 'editorAt', folio: 50 })).toEqual({ page: 10 }); // o folio mais próximo
    expect(syncAction(state(), { type: 'editorAt', folio: null })).toEqual({});
    expect(syncAction(state({ free: true }), { type: 'editorAt', folio: 3 })).toEqual({});
    expect(syncAction(state({ ready: false }), { type: 'editorAt', folio: 3 })).toEqual({});
    expect(syncAction(state({ folioToPage: new Map() }), { type: 'editorAt', folio: 3 })).toEqual({}); // sem mapa
});

test('o PDF acabou de abrir: vai para onde o editor está, mesmo no modo livre', () => {
    expect(syncAction(state({ free: true, ready: false }), { type: 'opened', editorFolio: 2 })).toEqual({ page: 4 });
    expect(syncAction(state(), { type: 'opened', editorFolio: null })).toEqual({});
});

test('mudar de página no PDF leva o editor ao folio dela; no modo livre só muda o PDF; o front matter não tem folio', () => {
    expect(syncAction(state(), { type: 'stepped', page: 6 })).toEqual({ page: 6, editorFolio: 4 });
    expect(syncAction(state({ free: true }), { type: 'stepped', page: 6 })).toEqual({ page: 6 });
    expect(syncAction(state(), { type: 'stepped', page: 1 })).toEqual({ page: 1 });  // sem folio: o editor fica
    expect(syncAction(state(), { type: 'stepped', page: 99 })).toEqual({ page: 10, editorFolio: 8 }); // limita ao fim
    expect(syncAction(state(), { type: 'stepped', page: 0 })).toEqual({ page: 1 });
});

test('clicar na página ("localizar no editor") leva o editor mesmo no modo livre', () => {
    expect(syncAction(state({ free: true }), { type: 'clicked', page: 5 })).toEqual({ page: 5, editorFolio: 3 });
});

test('salto pedido pelo assistente: por página do ficheiro ou por folio, a ambos; sem mapa só o PDF; sem PDF nada', () => {
    expect(syncAction(state({ free: true }), { type: 'jump', to: { pdf: 7 } })).toEqual({ page: 7, editorFolio: 5 });
    expect(syncAction(state(), { type: 'jump', to: { folio: 4 } })).toEqual({ page: 6, editorFolio: 4 });
    expect(syncAction(state(), { type: 'jump', to: { pdf: 2 } })).toEqual({ page: 2 });                       // front matter: só o PDF
    expect(syncAction(state({ mapsReady: false }), { type: 'jump', to: { pdf: 7 } })).toEqual({ page: 7 });   // o editor segue quando o mapa ficar pronto
    expect(syncAction(state({ ready: false }), { type: 'jump', to: { pdf: 7 } })).toEqual({});
    expect(syncAction(state(), { type: 'jump', to: { pdf: 99 } })).toEqual({ page: 10, editorFolio: 8 });
});
