import { test, expect, afterAll } from 'bun:test';
import { rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

process.env.JWT_SECRET ??= 'test-secret'; // config.js exige-o ao ser importado
const { list, add, revert, restore } = await import('./routes/ai-changes.js');
const { DATA_DIR } = await import('./config.js');
const { uid, post } = await import('./test-helpers.js');

const isbn = uid('ai-changes');
const user = { sub: '1', role: 'user', email: 'ana@t.pt' };
const other = { sub: '2', role: 'user', email: 'rui@t.pt' };
const dir = join(DATA_DIR, isbn, 'history');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'content_2026-01-01T00-00-00-000Z.html.gz'), 'x');
writeFileSync(join(dir, 'style_2026-01-01T00-00-00-000Z.css'), 'a{}');
afterAll(() => rmSync(join(DATA_DIR, isbn), { recursive: true, force: true }));

const HTML = 'content_2026-01-01T00-00-00-000Z.html.gz';
const CSS = 'style_2026-01-01T00-00-00-000Z.css';
const body = (over = {}) => post({ request: 'faz o fundo dos h1 vermelho', lines: ['Estilo alterado h1'], htmlFile: HTML, cssFile: CSS, ...over });

test('sem registos a lista vem vazia', async () => {
  expect(await (await list(isbn)).json()).toEqual({ changes: [] });
});

test('regista com quem e quando; lista os mais recentes primeiro', async () => {
  const a = (await (await add(body({ request: 'primeira' }), isbn, user)).json()).change;
  expect(a).toMatchObject({ request: 'primeira', by: 'ana@t.pt', htmlFile: HTML, cssFile: CSS, lines: ['Estilo alterado h1'] });
  expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
  await add(body({ request: 'segunda' }), isbn, other);
  const { changes } = await (await list(isbn)).json();
  expect(changes.map((c) => c.request)).toEqual(['segunda', 'primeira']);
});

test('só CSS ou só HTML chega; sem nenhum ficheiro recusa', async () => {
  expect((await add(body({ htmlFile: undefined }), isbn, user)).status).toBe(200);
  expect((await add(body({ cssFile: undefined }), isbn, user)).status).toBe(200);
  expect((await add(body({ htmlFile: undefined, cssFile: undefined }), isbn, user)).status).toBe(400);
});

test('validação: pedido, resumo, nomes de ficheiro (padrão e existência)', async () => {
  for (const over of [{ request: '' }, { request: 'x'.repeat(201) }, { lines: 'x' }, { lines: Array(31).fill('a') }, { lines: [5] },
    { htmlFile: '../x' }, { htmlFile: 'content_2000-01-01T00-00-00-000Z.html.gz' }, { cssFile: 'content_x.css' }, { cssFile: 'style_nao-existe.css' }]) {
    expect((await add(body(over), isbn, user)).status).toBe(400);
  }
});

test('marcar como revertida: quem e quando; id desconhecido → 404; id inválido → 400', async () => {
  const { id } = (await (await add(body(), isbn, user)).json()).change;
  const done = (await (await revert(isbn, id, other)).json()).change;
  expect(done).toMatchObject({ id, revertedBy: 'rui@t.pt' });
  expect(done.revertedAt).toBeTruthy();
  expect((await revert(isbn, 'nao-existe', user)).status).toBe(404);
  expect((await revert(isbn, '../x', user)).status).toBe(400);
});

test('reverter guarda o estado de antes de reverter; repor tira a marca e esse estado', async () => {
  const { id } = (await (await add(body(), isbn, user)).json()).change;
  const done = (await (await revert(isbn, id, user, post({ htmlFile: HTML, cssFile: CSS }))).json()).change;
  expect(done).toMatchObject({ restoreHtmlFile: HTML, restoreCssFile: CSS });
  const back = (await (await restore(isbn, id)).json()).change;
  expect(back.revertedAt).toBeUndefined();
  expect(back.restoreHtmlFile).toBeUndefined();
  expect((await revert(isbn, id, user, post({ htmlFile: '../x' }))).status).toBe(400);
  expect(restore(isbn, 'nao-existe').status).toBe(404);
});
