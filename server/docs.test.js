import { test, expect, afterEach } from 'bun:test';

process.env.JWT_SECRET ??= 'test-secret';
const { listDocs, putDoc, resetDoc } = await import('./routes/docs.js');
const { put } = await import('./test-helpers.js');

const admin = { sub: '1', role: 'admin', email: 'a@t.pt' };
const user = { sub: '2', role: 'user', email: 'u@t.pt' };

afterEach(() => { for (const id of ['editor', 'comofazer', 'assistente']) resetDoc(id, admin); });

test('sem edições, a lista vem vazia (valem os guias originais)', async () => {
  expect(await listDocs().json()).toEqual({});
});

test('o admin grava, a lista devolve-o e o reset apaga-o', async () => {
  expect((await putDoc(put({ content: '## 1. Novo\n\ntexto' }), 'editor', admin)).status).toBe(200);
  expect(await listDocs().json()).toEqual({ editor: '## 1. Novo\n\ntexto' });
  expect((await putDoc(put({ content: 'v2' }), 'editor', admin)).status).toBe(200); // volta a gravar por cima
  expect(await listDocs().json()).toEqual({ editor: 'v2' });
  expect((resetDoc('editor', admin)).status).toBe(200);
  expect(await listDocs().json()).toEqual({});
});

test('utilizador normal: 403 a gravar e a repor', async () => {
  expect((await putDoc(put({ content: 'x' }), 'editor', user)).status).toBe(403);
  expect(resetDoc('editor', user).status).toBe(403);
  expect(await listDocs().json()).toEqual({});
});

test('validação: guia desconhecido 404, texto vazio 400, texto enorme 413', async () => {
  expect((await putDoc(put({ content: 'x' }), 'outro', admin)).status).toBe(404);
  expect(resetDoc('outro', admin).status).toBe(404);
  expect((await putDoc(put({ content: '   ' }), 'editor', admin)).status).toBe(400);
  expect((await putDoc(put({}), 'editor', admin)).status).toBe(400);
  expect((await putDoc(put({ content: 'a'.repeat(200_001) }), 'editor', admin)).status).toBe(413);
});
