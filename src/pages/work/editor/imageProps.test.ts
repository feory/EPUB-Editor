import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { applyImageProps, readImageProps, EMPTY_IMAGE, type ImageDom } from './imageProps';

const doc = new Window().document;
const dom: ImageDom = {
    setStyle: (el, n, v) => { if (v) el.style.setProperty(n, v); else el.style.removeProperty(n); },
    setAttrib: (el, n, v) => { if (v === null) el.removeAttribute(n); else el.setAttribute(n, v); },
    addClass: (el, c) => el.classList.add(c),
    removeClass: (el, c) => el.classList.remove(c),
};
const img = () => doc.createElement('img') as unknown as HTMLElement;

test('applyImageProps escreve e readImageProps lê de volta; largura % tira width/height px', () => {
    const el = img();
    el.setAttribute('width', '300'); el.style.setProperty('height', '200px');
    applyImageProps(dom, el, { align: 'center', width: 60, marginTop: 1, marginBottom: 2, offsetY: -4, alt: 'Mapa' });
    expect(readImageProps(el)).toEqual({ align: 'center', width: 60, marginTop: 1, marginBottom: 2, offsetY: -4, alt: 'Mapa' });
    expect(el.hasAttribute('width')).toBe(false);
    expect(el.style.height).toBe('auto');
});

test('Repor (EMPTY_IMAGE) limpa tudo e troca de alinhamento é exclusiva', () => {
    const el = img();
    applyImageProps(dom, el, { align: 'left', width: 50, offsetY: 3 });
    applyImageProps(dom, el, { align: 'right' });
    expect(el.className).toBe('img-right');
    applyImageProps(dom, el, EMPTY_IMAGE);
    expect(readImageProps(el)).toEqual(EMPTY_IMAGE);
    expect(el.className).toBe('');
});
