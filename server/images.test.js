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

test('compressImages: reduz a largura e recodifica, mantém o nome', async () => {
  const sharp = (await import('sharp')).default;
  const { compressImages } = await import('./routes/images.js');
  const dir = join(DATA_DIR, isbn, 'images');
  mkdirSync(dir, { recursive: true });
  // ruído: não comprime sem perdas, mas 3000px → 1600px reduz bastante
  const noise = Buffer.alloc(3000 * 1000 * 3); for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 251;
  writeFileSync(join(dir, 'grande.png'), await sharp(noise, { raw: { width: 3000, height: 1000, channels: 3 } }).png().toBuffer());
  writeFileSync(join(dir, 'pequena.png'), await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer());
  const call = (body) => compressImages(new Request('http://x/images/compress', { method: 'POST', body: JSON.stringify(body) }), isbn);

  const res = await (await call({})).json();
  expect(res.changed.map((c) => c.filename)).toContain('grande.png');
  expect((await sharp(join(dir, 'grande.png')).metadata()).width).toBe(1600);
  expect((await sharp(join(dir, 'pequena.png')).metadata()).width).toBe(100); // nunca amplia
  expect(res.after).toBeLessThan(res.before);

  expect((await call({ maxWidth: 10 })).status).toBe(400);
});
