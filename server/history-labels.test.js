import { test, expect, afterAll } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, utimesSync, existsSync } from 'fs';
import { join } from 'path';

process.env.JWT_SECRET ??= 'test-secret';
const { DATA_DIR } = await import('./config.js');
const { readLabels, setLabel } = await import('./history-labels.js');
const { purgeOldExceptNewest } = await import('./scheduled-cleanup.js');

const isbn = `test-labels-${process.pid}`;
const dir = join(DATA_DIR, isbn, 'history');
mkdirSync(dir, { recursive: true });
afterAll(() => rmSync(join(DATA_DIR, isbn), { recursive: true, force: true }));

test('setLabel: guarda, apara, limita e remove com texto vazio', () => {
  expect(setLabel(isbn, 'content_a.html.gz', '  Antes da revisão  ')).toBe('Antes da revisão');
  expect(readLabels(isbn)).toEqual({ 'content_a.html.gz': 'Antes da revisão' });
  expect(setLabel(isbn, 'content_b.html.gz', 'x'.repeat(200)).length).toBe(80);
  expect(setLabel(isbn, 'content_a.html.gz', '')).toBe('');
  expect(Object.keys(readLabels(isbn))).toEqual(['content_b.html.gz']);
});

test('limpeza: apaga versões velhas, mas poupa a mais recente e as marcadas', async () => {
  const old = Date.now() / 1000 - 30 * 24 * 3600;
  for (const f of ['content_1.html.gz', 'content_2.html.gz', 'content_3.html.gz']) {
    writeFileSync(join(dir, f), 'x');
    utimesSync(join(dir, f), old, old);
  }
  writeFileSync(join(dir, 'content_4.html.gz'), 'x'); // a mais recente
  const r = await purgeOldExceptNewest(dir, f => f.startsWith('content_'), Date.now() - 7 * 24 * 3600 * 1000, new Set(['content_2.html.gz']));
  expect(r.count).toBe(2);
  expect(existsSync(join(dir, 'content_2.html.gz'))).toBe(true);
  expect(existsSync(join(dir, 'content_4.html.gz'))).toBe(true);
  expect(existsSync(join(dir, 'content_1.html.gz'))).toBe(false);
});
