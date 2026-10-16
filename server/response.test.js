import { test, expect } from 'bun:test';
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// config.js exige JWT_SECRET ao ser importado
process.env.JWT_SECRET ??= 'test-secret';
const { handleGetFile } = await import('./response.js');

const dir = mkdtempSync(join(tmpdir(), 'resp-'));
const path = join(dir, 'a.png');
writeFileSync(path, 'conteudo');
const get = (headers = {}) => handleGetFile(path, { 'X-Test': '1' }, new Request('http://x/a', { headers }));

test('sem req: resposta simples, sem validadores (como antes)', async () => {
  const r = await handleGetFile(path, { 'X-Test': '1' });
  expect(r.status).toBe(200);
  expect(r.headers.get('ETag')).toBeNull();
  expect(await r.text()).toBe('conteudo');
});

test('com req: 200 com ETag, Last-Modified e no-cache; mantém os cabeçalhos dados', async () => {
  const r = await get();
  expect(r.status).toBe(200);
  expect(r.headers.get('ETag')).toMatch(/^W\//);
  expect(r.headers.get('Last-Modified')).toBeTruthy();
  expect(r.headers.get('Cache-Control')).toBe('private, no-cache');
  expect(r.headers.get('X-Test')).toBe('1');
});

test('If-None-Match igual → 304 sem corpo; ficheiro alterado → 200 outra vez', async () => {
  const etag = (await get()).headers.get('ETag');
  const r304 = await get({ 'If-None-Match': etag });
  expect(r304.status).toBe(304);
  expect(await r304.text()).toBe('');
  expect(r304.headers.get('ETag')).toBe(etag);

  writeFileSync(path, 'conteudo novo, maior');
  const r = await get({ 'If-None-Match': etag });
  expect(r.status).toBe(200);
  expect(await r.text()).toBe('conteudo novo, maior');
});

test('If-Modified-Since: 304 se não mudou desde, 200 se mudou depois', async () => {
  const since = new Date(Date.now() + 5000).toUTCString();
  expect((await get({ 'If-Modified-Since': since })).status).toBe(304);
  utimesSync(path, new Date(), new Date(Date.now() + 60000));
  expect((await get({ 'If-Modified-Since': since })).status).toBe(200);
});

test('ficheiro em falta → 404', async () => {
  const r = await handleGetFile(join(dir, 'nao-existe.png'), {}, new Request('http://x/a'));
  expect(r.status).toBe(404);
  rmSync(dir, { recursive: true, force: true });
});
