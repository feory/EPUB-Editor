/**
 * Geometria do bloco ativo (blockGeometry.ts): o CSS gerado e as contas do JS têm de se
 * encontrar no mesmo sítio — a linha do anel. Cada teste é uma dessas igualdades.
 */
import { test, expect } from 'bun:test';
import {
    RING, RING_GAP, ACTIVE_PAD_Y, ACTIVE_PAD_X, PLUS_SIZE, PLUS_CUT, GRIP_WIDTH, GRIP_HEIGHT, PLUS_DY_ACTIVE,
    plusCenterY, gripLeft, gripZoneAt, gripCss, gripTop, nearGripLine, GRIP_ARROW, GRIP_NEAR_OUT, GRIP_NEAR_IN, activeBlockCss,
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
    expect(css).toContain(`margin-left: calc(var(--ps-ml, 0px) - ${ACTIVE_PAD_X}px) !important`);
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

// Pega em CSS: centrada na linha esquerda do anel; topo = gripTop (a meio da parte visível).
const BL = 464, GT = 300; // caixa do bloco ativo (left) e topo da pega — coords do iframe
const gx = gripLeft(BL) + GRIP_WIDTH / 2; // centro horizontal da pega

test('pega: zonas por altura — ▲ em cima, arrastar no meio, ▼ em baixo', () => {
    expect(gripZoneAt(gx, GT + 5, BL, GT)).toBe('up');
    expect(gripZoneAt(gx, GT + GRIP_ARROW + 5, BL, GT)).toBe('drag');
    expect(gripZoneAt(gx, GT + GRIP_HEIGHT / 2, BL, GT)).toBe('drag');
    expect(gripZoneAt(gx, GT + GRIP_HEIGHT - 5, BL, GT)).toBe('down');
});

test('pega: fora da pega (texto do bloco, acima, abaixo) → null', () => {
    expect(gripZoneAt(BL + 40, GT + 30, BL, GT)).toBeNull();
    expect(gripZoneAt(gx, GT - 2, BL, GT)).toBeNull();
    expect(gripZoneAt(gx, GT + GRIP_HEIGHT + 2, BL, GT)).toBeNull();
});

test('pega: só com o rato perto da linha esquerda, à altura do bloco', () => {
    const r = { left: BL, top: 200, bottom: 500 };
    expect(nearGripLine(BL - 4, 300, r)).toBe(true);                 // em cima da linha
    expect(nearGripLine(BL - GRIP_NEAR_OUT - 1, 300, r)).toBe(false); // longe, à esquerda
    expect(nearGripLine(BL + GRIP_NEAR_IN + 1, 300, r)).toBe(false);  // já dentro do texto
    expect(nearGripLine(BL - 4, 600, r)).toBe(false);                // abaixo do bloco
    // a pega inteira cabe na faixa (senão desaparecia ao chegar-lhe com o rato)
    expect(gripLeft(BL)).toBeGreaterThanOrEqual(BL - GRIP_NEAR_OUT);
    expect(gripLeft(BL) + GRIP_WIDTH).toBeLessThanOrEqual(BL + GRIP_NEAR_IN);
});

test('pega: a meio da parte visível do bloco; nunca fora da área visível', () => {
    expect(gripTop(300, 400, 0, 700)).toBe(350 - GRIP_HEIGHT / 2);
    const t = gripTop(450, 1200, 0, 600)!; // parágrafo que continua para lá do fundo
    expect(t).toBe((450 + 600) / 2 - GRIP_HEIGHT / 2);
    expect(t + GRIP_HEIGHT).toBeLessThanOrEqual(600);
    expect(gripTop(595, 900, 0, 600)).toBeNull(); // quase nada à vista
});

test('pega: o CSS põe-na onde o clique a procura (mesmos números, cortes como o "+")', () => {
    const css = gripCss();
    expect(css).toContain(`margin: calc(var(--grip-y, 0px) - ${ACTIVE_PAD_Y}px) 0 0 -${BL + ACTIVE_PAD_X - gripLeft(BL)}px`);
    expect(css).toContain(`width: ${GRIP_WIDTH}px; height: ${GRIP_HEIGHT}px`);
    expect(css).toContain(`0 -${PLUS_CUT}px 0 0 #fff, 0 ${PLUS_CUT}px 0 0 #fff`);
    expect(css).toContain('position: absolute'); // fora do fluxo: sticky fazia perder a indentação
    expect(css).toContain('body.ps-grip-near');
    expect(css).toContain(':not([data-mce-plusopen])::before');
});
