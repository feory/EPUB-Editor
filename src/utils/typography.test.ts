import { test, expect } from 'bun:test';
import '../services/indesign/happy-dom'; // DOMParser no bun
import { fixTypography } from './typography';

const one = (html: string, fixes?: Parameters<typeof fixTypography>[1]) => fixTypography([html], fixes);

test('aspas retas e curvas viram «…», sem espaço por dentro; entre elementos do mesmo bloco', () => {
    expect(one('<p>Disse "olá" e “adeus”.</p>').parts[0]).toBe('<p>Disse «olá» e «adeus».</p>'.replace('«adeus»', '«adeus»'));
    expect(one('<p>Disse " olá " mesmo.</p>').parts[0]).toBe('<p>Disse «olá» mesmo.</p>');
    expect(one('<p>"Vai <em>já</em>", disse.</p>').parts[0]).toBe('<p>«Vai <em>já</em>», disse.</p>'); // aspas em nós de texto diferentes
    expect(one('<p>"a" "b"</p>').counts.quotes).toBe(4);
});

test('aspas desemparelhadas: o bloco fica como estava e conta como ambíguo', () => {
    const r = one('<p>Citou "isto e aquilo.</p><p>Outra "certa".</p>');
    expect(r.parts[0]).toBe('<p>Citou "isto e aquilo.</p><p>Outra «certa».</p>');
    expect(r.skippedQuotes).toBe(1);
});

test('travessão de diálogo no início do bloco; " - " no meio vira " – "', () => {
    expect(one('<p>- Olá, disse ele.</p><p>– Sim.</p>').parts[0]).toBe('<p>— Olá, disse ele.</p><p>— Sim.</p>');
    expect(one('<p>O Pedro - o mais velho - saiu.</p>').parts[0]).toBe('<p>O Pedro – o mais velho – saiu.</p>');
    expect(one('<p>guarda-chuva e bem-vindo</p>').parts[0]).toBe('<p>guarda-chuva e bem-vindo</p>'); // hífen de palavra intacto
});

test('reticências e espaços: ... → …, espaços duplicados, espaço antes de pontuação', () => {
    expect(one('<p>Espera... sim .  Ok , está.</p>').parts[0]).toBe('<p>Espera… sim. Ok, está.</p>');
});

test('só mexe em texto: atributos, código e marcadores de capítulo ficam intactos', () => {
    const html = '<p class="chapter-break-h1" data-title="Um &quot;x&quot;"></p><p title="a &quot;b&quot;">"c"</p><pre>"d"</pre>';
    expect(one(html).parts[0]).toBe('<p class="chapter-break-h1" data-title="Um &quot;x&quot;"></p><p title="a &quot;b&quot;">«c»</p><pre>"d"</pre>');
});

test('fixes escolhidos: só esses; partes sem alterações ficam a mesma string; idempotente', () => {
    const html = '<p>"a"... b</p>';
    expect(one(html, ['ellipsis']).parts[0]).toBe('<p>"a"… b</p>');
    const odd = '<p>a  <br>b</p>';
    expect(fixTypography([odd], ['quotes']).parts[0]).toBe(odd);
    const first = one(html).parts[0];
    expect(fixTypography([first]).counts).toEqual({});
});

test('exemplo antes/depois', () => {
    expect(one('<p>Disse "olá".</p>').sample).toEqual({ before: 'Disse "olá".', after: 'Disse «olá».' });
    // a alteração está depois dos primeiros 90 caracteres: o exemplo mostra-a mesmo assim
    const long = `${'palavra '.repeat(20)}que... fim`;
    const r = one(`<p>${long}</p>`).sample!;
    expect(r.before).toContain('que...');
    expect(r.after).toContain('que…');
    expect(r.before).not.toBe(r.after);
});

test('"?" em série (marcador de campo) não perde o espaço; "?" isolado sim', () => {
    expect(one('<p>Depósito Legal n.º ???????</p>').parts[0]).toBe('<p>Depósito Legal n.º ???????</p>');
    expect(one('<p>Quem é ?</p>').parts[0]).toBe('<p>Quem é?</p>');
});

test('espaços duros e normais misturados, e entre elementos, viram um só', () => {
    const mixed = '<p>— \u00a0 \u00a0 \u00a0 <em>Dol</em>?</p>';
    expect(one(mixed).parts[0]).toBe('<p>— <em>Dol</em>?</p>');
    expect(one(mixed).counts.spaces).toBe(1);
    expect(one('<p>a <em> b</em></p>').parts[0]).toBe('<p>a <em>b</em></p>'); // um espaço no fim e outro no início do seguinte
    expect(one('<p>n.º\u00a05</p>').parts[0]).toBe('<p>n.º\u00a05</p>'); // um espaço duro SÓ fica
    expect(one('<p>a\t\tb</p>').parts[0]).toBe('<p>a b</p>');
});
