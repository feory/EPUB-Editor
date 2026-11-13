import { test, expect } from 'bun:test';
import '../services/indesign/happy-dom'; // DOMParser no bun
import { scanImages, scanPendingImages, setImageAlts } from './image-alt-scan';

const ch = (title: string, body: string) => `<p class="chapter-break-h1" data-title="${title}"></p><h1>${title}</h1>${body}`;
const img = (id: string, alt: string, extra = '') => `<p class="p-center"><img data-image-id="${id}" src="/api/ebooks/1/images/${id}" alt="${alt}"${extra} /></p>`;
const parts = [
    ch('Um', `<p>O mapa da região.</p>${img('mapa', 'Imagem importada')}<p class="p-legendas">Figura 1. Mapa</p>`),
    ch('Dois', `${img('mapa', 'Imagem')}${img('foto', 'Rapaz a correr')}${img('logo', '')}${img('orn', '', ' data-decorative="true"')}`),
];

test('scan: só as por escrever, uma vez por imagem, com contagem e contexto', () => {
    const found = scanPendingImages(parts);
    expect(found.map((f) => f.id)).toEqual(['mapa', 'logo']); // foto tem alt, orn é decorativa
    expect(found[0]).toMatchObject({ id: 'mapa', count: 2, chapter: 'Um', before: 'O mapa da região.', after: 'Figura 1. Mapa' });
});

test('aplicar: escreve em todas as ocorrências por escrever e conta as <img> alteradas', () => {
    const r = setImageAlts(parts, [{ id: 'mapa', alt: 'Mapa da região norte' }]);
    expect(r.changed).toBe(2);
    expect(r.parts[0]).toContain('alt="Mapa da região norte"');
    expect(r.parts[1]).toContain('alt="Mapa da região norte"');
});

test('aplicar: nunca sobrepõe um alt escrito; decorativa guarda alt vazio + marca', () => {
    const r = setImageAlts(parts, [{ id: 'foto', alt: 'Outro texto' }, { id: 'logo', alt: '', decorative: true }]);
    expect(r.parts[1]).toContain('alt="Rapaz a correr"');
    expect(r.parts[1]).toMatch(/<img[^>]*data-image-id="logo"[^>]*data-decorative="true"|<img[^>]*data-decorative="true"[^>]*data-image-id="logo"/);
    expect(r.changed).toBe(1);
});

test('aplicar: partes sem alterações ficam com a mesma string; e já aplicado não volta a contar', () => {
    const r = setImageAlts(parts, [{ id: 'nada', alt: 'x' }]);
    expect(r.parts[0]).toBe(parts[0]);
    expect(r.changed).toBe(0);
    const once = setImageAlts(parts, [{ id: 'mapa', alt: 'Mapa' }]).parts;
    expect(setImageAlts(once, [{ id: 'mapa', alt: 'Mapa' }]).changed).toBe(0);
    expect(scanPendingImages(once).map((f) => f.id)).toEqual(['logo']);
});

test('scanImages: todas as imagens com o alt atual, decorativa e usos com alts diferentes', () => {
    const all = scanImages(parts);
    expect(all.map((i) => [i.id, i.alt, i.decorative, i.count, i.mixed])).toEqual([
        ['mapa', 'Imagem importada', false, 2, true], // 'Imagem importada' vs 'Imagem': dois placeholders diferentes
        ['foto', 'Rapaz a correr', false, 1, false],
        ['logo', '', false, 1, false],
        ['orn', '', true, 1, false],
    ]);
});

test('overwrite: edição explícita substitui um alt escrito, desmarca decorativa e uniformiza os usos', () => {
    const r = setImageAlts(parts, [{ id: 'foto', alt: 'Rapaz a correr na praia', overwrite: true }, { id: 'orn', alt: 'Ornamento floral', overwrite: true }, { id: 'mapa', alt: 'Mapa', overwrite: true }]);
    expect(r.parts[1]).toContain('alt="Rapaz a correr na praia"');
    expect(r.parts[1]).toContain('alt="Ornamento floral"');
    expect(r.parts[1]).not.toContain('data-decorative');
    expect(r.changed).toBe(4);
    const all = scanImages(r.parts);
    expect(all.find((i) => i.id === 'mapa')).toMatchObject({ alt: 'Mapa', mixed: false });
});

test('overwrite: decorativa passa a alt vazio + marca; igual ao que já está não conta', () => {
    const r = setImageAlts(parts, [{ id: 'foto', alt: '', decorative: true, overwrite: true }]);
    expect(r.parts[1]).toMatch(/data-image-id="foto"[^>]*alt=""|alt=""[^>]*data-image-id="foto"/);
    expect(r.changed).toBe(1);
    expect(setImageAlts(r.parts, [{ id: 'foto', alt: '', decorative: true, overwrite: true }]).changed).toBe(0);
});
