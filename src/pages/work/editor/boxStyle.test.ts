import { describe, test, expect } from 'bun:test';
import { parseBoxStyle, applyBoxStyle } from './boxStyle';

const CSS = `
    .p-quote { margin-left: 4.5em; }
    .box { border: 2px solid #000; padding: 0.8em 1em; margin: 1em 0; }
    .footnote { color: red; }
`;

describe('boxStyle', () => {
    test('parses width/color from border shorthand, no background by default', () => {
        expect(parseBoxStyle(CSS)).toEqual({ backgroundColor: '', borderColor: '#000', borderWidth: 2 });
    });

    test('applyBoxStyle sets background-color without touching other declarations', () => {
        const next = applyBoxStyle(CSS, { backgroundColor: '#ffcc00' });
        expect(next).toContain('background-color: #ffcc00;');
        expect(next).toContain('border: 2px solid #000;');
        expect(next).toContain('padding: 0.8em 1em;');
        expect(next).toContain('.p-quote { margin-left: 4.5em; }');
    });

    test('applyBoxStyle rewrites border shorthand when width/color change', () => {
        const next = applyBoxStyle(CSS, { borderWidth: 4, borderColor: '#ff0000' });
        expect(next).toContain('border: 4px solid #ff0000;');
    });

    test('applyBoxStyle removes border when width set to 0', () => {
        const next = applyBoxStyle(CSS, { borderWidth: 0 });
        expect(parseBoxStyle(next).borderWidth).toBe(0);
        expect(next).not.toContain('border:');
    });

    test('applyBoxStyle creates .box rule when missing', () => {
        const withoutBox = CSS.replace(/\.box[^}]*\}/, '');
        const next = applyBoxStyle(withoutBox, { backgroundColor: '#eeeeee' });
        expect(parseBoxStyle(next)).toEqual({ backgroundColor: '#eeeeee', borderColor: '', borderWidth: 0 });
    });
});
