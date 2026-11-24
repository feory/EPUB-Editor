import { test, expect } from 'bun:test';
import { classEffects } from './css-rule';

const names = (set: Set<string>) => [...set].sort();

test('classEffects: espaço acima = margin-top ou o 1.º valor de margin maior que 0; só regras de uma classe', () => {
    const css = `
        p { margin-top: 0; }
        .p-top { margin-top: 30px !important; }
        .p-bold { font-weight: bold !important; margin-top: 1.5em; }
        .nada { margin-top: 0; }
        .curto { margin: 1em 0 0 0; }
        .lados { margin: 0 2em; }
        .a .b { margin-top: 2em; }
        p.c { margin-top: 2em; }
        /* .comentada { margin-top: 3em; } */
        .sem { color: red; }
    `;
    expect(names(classEffects(css).top)).toEqual(['curto', 'p-bold', 'p-top']);
});

test('classEffects: numa classe repetida vale a última declaração de cada propriedade', () => {
    expect(classEffects('.x { margin-top: 2em; } .x { margin-top: 0; }').top.has('x')).toBe(false);
    expect(classEffects('.x { margin-top: 0; } .x { margin-top: 2em; }').top.has('x')).toBe(true);
    expect(classEffects('.x { margin-top: 2em; } .x { color: red; }').top.has('x')).toBe(true); // outra declaração não a anula
});

test('classEffects: negrito, itálico, centrado, letra pequena e recuo, pelo que a regra faz e não pelo nome', () => {
    const fx = classEffects(`
        .p-subtitulo { font-weight: 700 !important; margin-top: 1.5em; }
        .forte { font-weight: bold; }
        .normal { font-weight: 400; }
        .oblíqua { font-style: oblique; }
        .it { font-style: italic; }
        .meio { text-align: center; }
        .esq { text-align: left; }
        .peq { font-size: 0.85em; }
        .peq2 { font-size: 90%; }
        .grande { font-size: 1.2em; }
        .px { font-size: 12px; }
        .rec { text-indent: 1.5em; }
        .zero { text-indent: 0; }
    `);
    expect(names(fx.bold)).toEqual(['forte', 'p-subtitulo']);
    expect(names(fx.italic)).toEqual(['it']);
    expect(names(fx.center)).toEqual(['meio']);
    expect(names(fx.small)).toEqual(['peq', 'peq2']);
    expect(names(fx.indent)).toEqual(['rec']);
    expect(names(fx.top)).toEqual(['p-subtitulo']);
});
