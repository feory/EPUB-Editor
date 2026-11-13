import { test, expect } from 'bun:test';
import '../../../services/indesign/happy-dom'; // DOMParser no bun
import { collectFacts, buildChecklist, type PublicationFacts } from './publicationChecklist';
import type { ValidationDigest } from '../../../utils/validation-digest';

const meta = { title: 'T', author: 'A', language: 'pt', description: 'd', publisher: 'P', pub_date: '2026', subjects: 's', ebook_isbn: '978' };
const facts = (over: Partial<PublicationFacts> = {}): PublicationFacts => ({ metadata: meta, hasCover: true, images: { total: 3, withoutAlt: 0 }, indice: { exists: true, linked: 5, linkable: 5 }, pageMarkers: 10, ...over });
const digest = (n: number, severity: 'erro' | 'aviso' = 'aviso'): ValidationDigest => ({ source: 's', valid: !n, groups: n ? [{ rule: 'r', severity, count: n, description: '', files: [], examples: [] }] : [], omittedGroups: 0 });
const states = (items: { item: string; estado: string }[]) => Object.fromEntries(items.map((i) => [i.item, i.estado]));

test('tudo em ordem: tudo ok', () => {
    const items = buildChecklist(facts(), [{ kind: 'footnotes', digest: digest(0) }, { kind: 'accessibility', digest: digest(0) }]);
    expect(items.every((i) => i.estado === 'ok')).toBe(true);
});

test('metadados obrigatórios em falta → falta; só recomendados → aviso; capa e imagens', () => {
    expect(states(buildChecklist(facts({ metadata: { ...meta, author: '  ' } }), [])).Metadados).toBe('falta');
    expect(states(buildChecklist(facts({ metadata: { ...meta, subjects: '', publisher: undefined } }), [])).Metadados).toBe('aviso');
    const s = states(buildChecklist(facts({ hasCover: false, images: { total: 4, withoutAlt: 2 } }), []));
    expect(s.Capa).toBe('falta');
    expect(s['Texto alternativo das imagens']).toBe('falta');
    expect(buildChecklist(facts({ images: { total: 4, withoutAlt: 2 } }), []).find((i) => i.item.startsWith('Texto'))?.detalhe).toBe('2 de 4 imagens sem texto');
});

test('Índice: sem Índice é info; entradas por ligar é falta; lista de páginas sem marcadores é info', () => {
    expect(states(buildChecklist(facts({ indice: { exists: false, linked: 0, linkable: 0 } }), [])).Índice).toBe('info');
    const i = buildChecklist(facts({ indice: { exists: true, linked: 2, linkable: 5 } }), []).find((x) => x.item === 'Índice')!;
    expect(i).toMatchObject({ estado: 'falta', detalhe: '3 de 5 entradas por ligar' });
    expect(states(buildChecklist(facts({ pageMarkers: 0 }), []))['Lista de páginas']).toBe('info');
});

test('validações: problemas com erro → falta, só avisos → aviso, não correu → aviso com onde resolver', () => {
    const s = buildChecklist(facts(), [{ kind: 'links', digest: digest(2) }, { kind: 'epub', digest: digest(1, 'erro') }, { kind: 'accessibility', digest: null }]);
    expect(states(s).Links).toBe('aviso');
    expect(states(s).EPUBCheck).toBe('falta');
    expect(s.find((i) => i.item.startsWith('Acessibilidade'))).toMatchObject({ estado: 'aviso', detalhe: 'não foi possível correr' });
});

test('collectFacts: conta imagens sem texto, ligações do Índice e marcadores de página', () => {
    const parts = [
        '<p class="chapter-break-h1" data-title="Índice"></p><h1>Índice</h1><p>Um 1</p>',
        '<p class="chapter-break-h1" data-title="Um"></p><h1>Um</h1><p><img src="/api/ebooks/1/images/a1" alt="Imagem importada"><img src="/api/ebooks/1/images/b2" alt="Uma praia"><span class="pagebreak" data-page="3"></span></p>',
    ];
    const f = collectFacts({ ebook: { title: 'T' }, hasCover: false, parts, indiceTitles: ['Índice'] });
    expect(f.images.withoutAlt).toBe(1);
    expect(f.pageMarkers).toBe(1);
    expect(f.indice.exists).toBe(true);
    expect(f.hasCover).toBe(false);
});
