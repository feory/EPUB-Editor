import { test, expect, afterAll } from 'bun:test';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';

process.env.JWT_SECRET ??= 'test-secret'; // config.js exige-o ao ser importado
const { saveStyleSnapshot, getStyleSnapshot } = await import('./routes/content.js');
const { readLabels } = await import('./history-labels.js');
const { DATA_DIR } = await import('./config.js');
const { uid, post } = await import('./test-helpers.js');

const isbn = uid('style-snap');
afterAll(() => rmSync(join(DATA_DIR, isbn), { recursive: true, force: true }));

test('guarda o CSS anterior com etiqueta e devolve-o', async () => {
  const css = '.p-quote { font-size: 0.85em !important; }\n';
  const res = await saveStyleSnapshot(post({ css, label: 'Antes de IA: faz a citação mais pequena' }), isbn);
  const { filename } = await res.json();
  expect(filename).toMatch(/^style_[\w-]+\.css$/);
  expect(existsSync(join(DATA_DIR, isbn, 'history', filename))).toBe(true);
  expect(readLabels(isbn)[filename]).toBe('Antes de IA: faz a citação mais pequena'); // etiquetada = protegida da limpeza
  expect(await (await getStyleSnapshot(isbn, filename)).json()).toEqual({ css });
});

test('cada pedido cria uma versão nova (não reaproveita, para não trocar a etiqueta de outra)', async () => {
  const a = await (await saveStyleSnapshot(post({ css: 'a{}', label: 'um' }), isbn)).json();
  await new Promise((r) => setTimeout(r, 5));
  const b = await (await saveStyleSnapshot(post({ css: 'a{}', label: 'dois' }), isbn)).json();
  expect(a.filename).not.toBe(b.filename);
  expect(readLabels(isbn)[a.filename]).toBe('um');
});

test('validação: css em falta, demasiado grande, nomes de ficheiro inválidos e inexistentes', async () => {
  expect((await saveStyleSnapshot(post({ label: 'x' }), isbn)).status).toBe(400);
  expect((await saveStyleSnapshot(post({ css: 'x'.repeat(5_000_001) }), isbn)).status).toBe(413);
  for (const name of ['../x', 'content_2026-01-01T00-00-00-000Z.html', 'style_x.html', 'style_..%2Fx.css']) {
    expect((await getStyleSnapshot(isbn, name)).status).toBe(400);
  }
  expect((await getStyleSnapshot(isbn, 'style_2000-01-01T00-00-00-000Z.css')).status).toBe(404);
});
