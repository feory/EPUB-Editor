import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { applyBoxProps, readBoxProps, type BoxDom } from './boxProps';

const doc = new Window().document;
const dom: BoxDom = {
    setStyle: (el, name, value) => { if (value) el.style.setProperty(name, value); else el.style.removeProperty(name); },
    addClass: (el, c) => el.classList.add(c),
    removeClass: (el, c) => el.classList.remove(c),
};
const box = () => doc.createElement('div') as unknown as HTMLElement;

test('applyBoxProps escreve e readBoxProps lê de volta', () => {
    const el = box();
    applyBoxProps(dom, el, { variant: 'aviso', background: '#fee2e2', borderWidth: 3, borderStyle: 'dashed', radius: 8, padding: 1.5, marginY: 2, width: 80 });
    expect(readBoxProps(el)).toMatchObject({ variant: 'aviso', background: '#fee2e2', borderWidth: 3, borderStyle: 'dashed', radius: 8, padding: 1.5, marginY: 2, width: 80 });
    expect(el.style.marginLeft).toBe('auto'); // < 100% → centrada
});

test('valores vazios/null removem o style; variante Padrão tira a classe; 100% tira a centragem', () => {
    const el = box();
    applyBoxProps(dom, el, { variant: 'nota', background: '#fff', width: 80 });
    applyBoxProps(dom, el, { variant: '', background: '', width: 100 });
    expect(el.className).toBe('');
    expect(el.style.backgroundColor).toBe('');
    expect(el.style.marginLeft).toBe('');
});
