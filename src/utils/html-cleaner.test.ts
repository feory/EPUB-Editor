import { test, expect, beforeAll } from 'bun:test';
import { Window } from 'happy-dom';
import { cleanEditorHtml, cleanHtml } from './html-cleaner';

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

test('removeLinks: desembrulha <a> (também multi-linha) sem apanhar <abbr>/<aside>', () => {
  expect(cleanHtml('<p><abbr title="x">AB</abbr> e <a href="u">link</a></p>', { removeLinks: true }))
    .toBe('<p><abbr title="x">AB</abbr> e link</p>');
  expect(cleanHtml('<p><a href="u">li\nnk</a> fim</p>', { removeLinks: true })).toBe('<p>li\nnk fim</p>');
});
