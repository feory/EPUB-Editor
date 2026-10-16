import { test, expect, afterAll } from 'bun:test';
import { rmSync, readdirSync } from 'fs';
import { join } from 'path';

// config.js exige JWT_SECRET ao ser importado
process.env.JWT_SECRET ??= 'test-secret';
const { saveContent, getContent } = await import('./routes/content.js');
const { DATA_DIR } = await import('./config.js');

const isbn = `test-dedupe-${process.pid}`;
afterAll(() => rmSync(join(DATA_DIR, isbn), { recursive: true, force: true }));

const save = (content) => saveContent(new Request('http://x/c', { method: 'POST', body: JSON.stringify({ content }) }), isbn).then(r => r.json());
const versions = () => readdirSync(join(DATA_DIR, isbn, 'history')).length;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

test('save igual à última versão não escreve outra; diferente escreve', async () => {
  const a = await save('UNCOMPRESSED:<p>a</p>');
  expect(a.message).toBe('Saved');
  expect(versions()).toBe(1);

  const again = await save('UNCOMPRESSED:<p>a</p>');
  expect(again.message).toBe('Unchanged');
  expect(again.filename).toBe(a.filename);
  expect(versions()).toBe(1);

  await wait(5); // nome com timestamp ao ms
  const b = await save('UNCOMPRESSED:<p>b</p>');
  expect(b.message).toBe('Saved');
  expect(versions()).toBe(2);
});

test('voltar a um texto antigo (≠ da última) conta como alteração', async () => {
  await wait(5);
  const r = await save('UNCOMPRESSED:<p>a</p>'); // última é "b"
  expect(r.message).toBe('Saved');
  expect(versions()).toBe(3);
});

test('getContent devolve a versão mais recente', async () => {
  const res = await getContent(new Request('http://x/c'), isbn, new URL('http://x/c'));
  expect((await res.json()).content).toBe('UNCOMPRESSED:<p>a</p>');
});
