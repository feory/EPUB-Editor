import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { applyColumnsProps, readColumnsProps, EMPTY_COLUMNS, type ColumnsDom } from './columnsProps';
import { cleanEditorDOM } from '../../../utils/html-cleaner';

const doc = new Window().document;
const dom: ColumnsDom = { setStyle: (el, n, v) => { if (v) el.style.setProperty(n, v); else el.style.removeProperty(n); } };

test('applyColumnsProps escreve e lê de volta; EMPTY_COLUMNS repõe', () => {
    const el = doc.createElement('div') as unknown as HTMLElement;
    applyColumnsProps(dom, el, { ratio: '1fr 2fr', gap: 2 });
    expect(readColumnsProps(el)).toEqual({ ratio: '1fr 2fr', gap: 2 });
    applyColumnsProps(dom, el, EMPTY_COLUMNS);
    expect(readColumnsProps(el)).toEqual(EMPTY_COLUMNS);
});

test('cleanEditorDOM mantém o parágrafo vazio único de cada coluna (senão fica não editável)', () => {
    const body = doc.createElement('div') as unknown as HTMLElement;
    body.innerHTML = '<div class="columns"><div class="col"><p><br></p></div><div class="col"><p>x</p><p><br></p></div></div><p><br></p>';
    cleanEditorDOM(body);
    expect(body.innerHTML).toBe('<div class="columns"><div class="col"><p><br></p></div><div class="col"><p>x</p></div></div>');
});
