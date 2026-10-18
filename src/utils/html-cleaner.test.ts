import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import { cleanEditorHtml } from './html-cleaner';

beforeAll(() => {
  const win = new Window();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.assign(globalThis as any, { document: win.document, DOMParser: win.DOMParser, NodeFilter: win.NodeFilter });
});

test('cleanEditorHtml: tira o destaque temporário preso (highlight-pulse) sem tocar noutras classes', () => {
  const out = cleanEditorHtml('<h1>T</h1><p class="highlight-pulse">Um</p><p class="p-center highlight-pulse">Dois</p><p class="highlight-pulse p-small">Três</p>');
  expect(out).not.toContain('highlight-pulse');
  expect(out).toContain('p-center');
  expect(out).toContain('p-small');
});
