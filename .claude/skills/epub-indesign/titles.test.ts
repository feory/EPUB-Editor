// Política de títulos do InDesign — casos reais dos 15 EPUBs.
// Correr: bun test ./.claude/skills/epub-indesign/
import { test, expect } from 'bun:test';
import { indesignTitle, type TitlePage } from './titles';

const page = (p: Partial<TitlePage>): TitlePage =>
    ({ title: '', href: 'OEBPS/x.xhtml', bodyText: '', frontMatter: false, hasImage: false, hasHeading: false, ...p });

test('ficha técnica com rótulo "Título original:" → Ficha Técnica', () => {
    expect(indesignTitle(page({ title: 'Título original:', bodyText: 'Título original: … © Editora, 2026' }))).toBe('Ficha Técnica');
});

test('ficha técnica com título = nome do ficheiro → Ficha Técnica', () => {
    expect(indesignTitle(page({ title: 'Livro_ebook-2', href: 'OEBPS/Livro_ebook-2.xhtml', bodyText: 'ISBN 978-989' }))).toBe('Ficha Técnica');
});

test('ficha técnica antes do Índice, mesmo com título "real" (título do livro) → Ficha Técnica', () => {
    expect(indesignTitle(page({ title: 'O RITUAL DO PODER', bodyText: '© 2026', frontMatter: true }))).toBe('Ficha Técnica');
});

test('rótulo copiado da ficha numa página que não é a ficha → Rosto', () => {
    expect(indesignTitle(page({ title: 'Título:', bodyText: 'O Livro' }))).toBe('Rosto');
});

test('antes do Índice com imagem ou títulos → Rosto', () => {
    expect(indesignTitle(page({ title: 'INTERVENÇÃO SOCIAL', frontMatter: true, hasImage: true }))).toBe('Rosto');
    expect(indesignTitle(page({ title: 'Gestão Estratégica', frontMatter: true, hasHeading: true }))).toBe('Rosto');
});

test('página de imagem com título = nome do ficheiro fica sem título (junta-se à anterior)', () => {
    expect(indesignTitle(page({ title: 'Livro_ebook-3', href: 'OEBPS/Livro_ebook-3.xhtml', frontMatter: true, hasImage: true }))).toBe('Livro_ebook-3');
});

test('dedicatória (texto simples) mantém o título, antes ou depois do Índice', () => {
    expect(indesignTitle(page({ title: 'Para Danny Woodward 1963–2025', frontMatter: true, bodyText: 'Para Danny…' }))).toBe('Para Danny Woodward 1963–2025');
    expect(indesignTitle(page({ title: 'Para o Daniel, com amor', bodyText: 'Para o Daniel, com amor' }))).toBe('Para o Daniel, com amor');
});

test('capítulo normal mantém o título', () => {
    expect(indesignTitle(page({ title: 'Capítulo 2.', bodyText: 'texto © citado' }))).toBe('Capítulo 2.');
});
