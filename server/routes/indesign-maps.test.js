import { test, expect } from 'bun:test';
import { existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// config.js exige JWT_SECRET; valor dummy + import dinâmico (como em log-activity.test.js)
Bun.env.JWT_SECRET ??= 'test-secret';
const { getDecisions, saveDecisions } = await import('./indesign-maps.js');

const put = (body) => new Request('http://x', { method: 'PUT', body: typeof body === 'string' ? body : JSON.stringify(body) });

test('Decisões do livro: guardar, ler, apagar quando vazias, recusar inválidas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'indesign-maps-'));
  expect(await getDecisions('978', dir).json()).toEqual({ classes: {} });

  const classes = { 'p.subtitulos': { target: 'p-bold', origem: 'revisto' } };
  expect((await saveDecisions(put({ classes }), '978', dir)).status).toBe(200);
  expect(await getDecisions('978', dir).json()).toEqual({ classes });

  await saveDecisions(put({ classes: {} }), '978', dir);
  expect(existsSync(join(dir, '978.json'))).toBe(false);

  expect((await saveDecisions(put('não é json'), '978', dir)).status).toBe(400);
  expect((await saveDecisions(put({ classes: { 'p.X': { target: 1 } } }), '978', dir)).status).toBe(400);
});
