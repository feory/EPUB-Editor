import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { readInlineStyle, setInlineFormat, type FormatterLike } from './selectionFormats';

const FORMAT_CSS: Record<string, string> = {
    forecolor: 'color', hilitecolor: 'background-color', letterspacing: 'letter-spacing', fontsize: 'font-size', fontname: 'font-family',
};
// Formatos que o TinyMCE remove "por semelhança" (remove_similar); os outros só saem pelo valor exato que lá está.
const SIMILAR = new Set(['forecolor', 'hilitecolor', 'letterspacing']);

/** Imita, sobre um <span style>, as manhas do formatter do TinyMCE medidas no editor real. */
function quirkyFormatter(span: HTMLElement): FormatterLike {
    return {
        apply: (format, { value }) => span.style.setProperty(FORMAT_CSS[format], value),
        remove: (format, { value }, _node, similar) => {
            const css = FORMAT_CSS[format];
            if (SIMILAR.has(format) ? (similar || value === span.style.getPropertyValue(css)) : value !== null && value === span.style.getPropertyValue(css)) span.style.removeProperty(css);
        },
    };
}

function setup() {
    const doc = new Window().document;
    const root = doc.createElement('div');
    root.innerHTML = '<p>ola <span style="color: rgb(0, 0, 255); background-color: rgb(255, 224, 102); font-size: 1.2em; letter-spacing: 1em; font-family: serif">mundo</span> bonito</p>';
    const p = root.querySelector('p') as unknown as HTMLElement;
    const span = root.querySelector('span') as unknown as HTMLElement;
    const range = (startNode: Node, startOffset: number, endNode: Node, endOffset: number) => {
        const r = doc.createRange();
        r.setStart(startNode as never, startOffset); r.setEnd(endNode as never, endOffset);
        return r as unknown as Range;
    };
    return { p, span, range, isBlock: (el: Element) => el.nodeName === 'P' };
}

test('o formatter imitado tem a manha real: remover tamanho/família com null não faz nada', () => {
    const { span } = setup();
    const fmt = quirkyFormatter(span);
    fmt.remove('fontsize', { value: null }, undefined, true);
    fmt.remove('hilitecolor', { value: null }, undefined, true);
    expect(span.style.getPropertyValue('font-size')).toBe('1.2em');
    expect(span.style.getPropertyValue('background-color')).toBe('');
});

test('readInlineStyle: seleção como o TinyMCE a deixa depois de aplicar (início dentro do span, fim fora)', () => {
    const { p, span, range, isBlock } = setup();
    const r = range(span.firstChild as Node, 0, p, 2);
    expect(readInlineStyle(r, isBlock, 'letter-spacing')).toBe('1em');
    expect(readInlineStyle(r, isBlock, 'font-family')).toBe('serif');
});

test('readInlineStyle: seleção que começa antes do span apanha o span que a interseta; sem span, ""', () => {
    const { p, span, range, isBlock } = setup();
    expect(readInlineStyle(range(p.firstChild as Node, 1, p, 2), isBlock, 'font-size')).toBe('1.2em');
    expect(readInlineStyle(range(p.firstChild as Node, 0, p.firstChild as Node, 3), isBlock, 'font-size')).toBe('');
    expect(span.style.getPropertyValue('font-size')).toBe('1.2em');
});

test('setInlineFormat: tirar cada propriedade resulta mesmo, incluindo tamanho e família (precisam do valor exato)', () => {
    const { p, span, range, isBlock } = setup();
    const r = range(span.firstChild as Node, 0, p, 2);
    const read = (css: string) => readInlineStyle(r, isBlock, css);
    const fmt = quirkyFormatter(span);
    for (const [format, css] of Object.entries(FORMAT_CSS)) {
        setInlineFormat(fmt, read, format, css, null);
        expect(span.style.getPropertyValue(css)).toBe('');
    }
});

test('setInlineFormat: aplicar escreve o valor', () => {
    const { span, p, range, isBlock } = setup();
    const r = range(span.firstChild as Node, 0, p, 2);
    setInlineFormat(quirkyFormatter(span), (css) => readInlineStyle(r, isBlock, css), 'letterspacing', 'letter-spacing', '0.05em');
    expect(span.style.getPropertyValue('letter-spacing')).toBe('0.05em');
});
