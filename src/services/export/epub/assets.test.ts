import { test, expect } from 'bun:test';
import { generateNavXhtml, generateContentOpf } from './assets';
import type { Section, BookMetadata } from './types';

const sections: Section[] = [{ title: 'Um', content: '<p>a</p>', level: 'h1', parentIdx: -1, childIndices: [] } as Section];
const pages = [{ section: 1, page: 1 }, { section: 1, page: 2 }];
const meta = { title: 'T', author: 'A', language: 'pt' } as BookMetadata;
const cover = { xhtmlItem: '', imageItem: '', spineItem: '', meta: '' };

test('lista de páginas: só o nav page-list (nav.xhtml), sem página pagelist.xhtml nem entrada no Índice', () => {
    const nav = generateNavXhtml(sections, pages);
    expect(nav.match(/epub:type="page-list"/g)).toHaveLength(1);
    expect(nav).not.toContain('pagelist.xhtml');
    const opf = generateContentOpf(sections, meta, 'id', '', '', cover, true);
    expect(opf).not.toContain('pagelist');
    expect(opf).toContain('pageNavigation'); // a acessibilidade da lista de páginas mantém-se
});

test('sem páginas não há page-list', () => {
    expect(generateNavXhtml(sections, [])).not.toContain('page-list');
});
