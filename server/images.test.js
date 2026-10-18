import { test, expect, afterAll } from 'bun:test';
import { rmSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// config.js exige JWT_SECRET ao ser importado
process.env.JWT_SECRET ??= 'test-secret';
const { batchImages } = await import('./routes/images.js');
const { DATA_DIR } = await import('./config.js');

const isbn = `test-images-${process.pid}`;
afterAll(() => rmSync(join(DATA_DIR, isbn), { recursive: true, force: true }));

const upload = (name, type) => {
  const fd = new FormData();
  fd.append('images', new File([`${name}-${Date.now()}`], name, { type }));
  return batchImages(new Request('http://x/images/batch', { method: 'POST', body: fd }), isbn);
};

test('batchImages: substituir uma imagem apaga a miniatura e a variante noutra extensão', async () => {
  await upload('foto.png', 'image/png');
  mkdirSync(join(DATA_DIR, isbn, 'thumbnails'), { recursive: true });
  writeFileSync(join(DATA_DIR, isbn, 'thumbnails', 'foto.png'), 'thumb-antiga');

  // mesma extensão: só a miniatura velha sai
  await upload('foto.png', 'image/png');
  expect(readdirSync(join(DATA_DIR, isbn, 'thumbnails'))).toEqual([]);

  // outra extensão: a variante .png sai, fica só a .jpg
  writeFileSync(join(DATA_DIR, isbn, 'thumbnails', 'foto.png'), 'thumb-antiga');
  await upload('foto.jpg', 'image/jpeg');
  expect(readdirSync(join(DATA_DIR, isbn, 'images'))).toEqual(['foto.jpg']);
  expect(readdirSync(join(DATA_DIR, isbn, 'thumbnails'))).toEqual([]);
});
