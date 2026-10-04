/**
 * Geometria do bloco ativo (blockGeometry.ts): o CSS gerado e as contas do JS têm de se
 * encontrar no mesmo sítio — a linha do anel. Cada teste é uma dessas igualdades.
 */
import { test, expect } from 'bun:test';
import {
    RING, RING_GAP, ACTIVE_PAD_Y, ACTIVE_PAD_X, PLUS_SIZE, PLUS_CUT, GRIP_WIDTH, GRIP_HEIGHT, PLUS_DY_ACTIVE,
    plusCenterY, gripLeft, gripTop, activeBlockCss,
} from '../blockGeometry';
import { buildContentStyle } from '../contentStyles';

test('"+" do bloco ativo fica em cima da linha do anel (RING abaixo da caixa do bloco)', () => {
    const borderBottom = 300;
    const contentBottom = borderBottom - ACTIVE_PAD_Y; // padding do bloco ativo
    expect(plusCenterY(contentBottom, true)).toBe(borderBottom + RING);
});

test('"+" de um bloco não ativo fica na aresta inferior do conteúdo', () => {
    expect(plusCenterY(300, false)).toBe(300);
});

test('pega centrada na linha do anel', () => {
    const blockLeft = 464;
    expect(gripLeft(blockLeft) + GRIP_WIDTH / 2).toBe(blockLeft - RING);
});

test('CSS do bloco ativo usa os mesmos números (padding, margem, anel, desvio do "+")', () => {
    const css = activeBlockCss();
    expect(css).toContain(`padding: ${ACTIVE_PAD_Y}px ${ACTIVE_PAD_X}px !important`);
    expect(css).toContain(`margin-left: -${ACTIVE_PAD_X}px !important`);
    expect(css).toContain(`0 0 0 ${RING_GAP}px #fff, 0 0 0 ${RING}px`);
    expect(css).toContain(`--plus-dy: ${PLUS_DY_ACTIVE}px`);
});

test('marcadores de capítulo mantêm a geometria própria quando ativos (sem padding/margem do bloco ativo)', () => {
    const css = activeBlockCss();
    const padRule = css.slice(css.indexOf('padding:') - 80, css.indexOf('padding:'));
    expect(padRule).toContain(':not([class*="chapter-break"])');
});

test('content_style inclui o bloco ativo e o "+" com o diâmetro e os cortes das constantes', () => {
    const css = buildContentStyle('');
    expect(css).toContain(activeBlockCss());
    expect(css).toContain(`width: ${PLUS_SIZE}px; height: ${PLUS_SIZE}px`);
    expect(css).toContain(`calc(var(--plus-dy, 0px) - ${PLUS_SIZE / 2}px)`);
    expect(css).toContain(`-${PLUS_CUT}px 0 0 0 #fff, ${PLUS_CUT}px 0 0 0 #fff`);
});

// Espaço útil do editor: entre a barra de ferramentas (200) e a barra de estado (600).
const MIN = 200, MAX = 600;

test('pega: bloco curto todo visível → centrada no bloco', () => {
    expect(gripTop(300, 400, MIN, MAX)).toBe(350 - GRIP_HEIGHT / 2);
});

test('pega: parágrafo que continua para lá do fundo do editor → não passa da barra de estado', () => {
    const top = gripTop(450, 900, MIN, MAX)!; // meio do bloco (675) já fora do editor
    expect(top + GRIP_HEIGHT).toBeLessThanOrEqual(MAX);
    expect(top).toBe((450 + 600) / 2 - GRIP_HEIGHT / 2); // centrada na parte visível (450–600)
});

test('pega: parágrafo que começa acima (por baixo da barra de ferramentas) → não sobe para cima dela', () => {
    expect(gripTop(-300, 260, MIN, MAX)!).toBeGreaterThanOrEqual(MIN);
});

test('pega: bloco quase todo fora de vista, ou editor mais baixo que a pega → escondida', () => {
    expect(gripTop(595, 900, MIN, MAX)).toBeNull();
    expect(gripTop(300, 400, 300, 360)).toBeNull();
});
