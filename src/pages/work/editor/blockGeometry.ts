/**
 * Geometria do Bloco ativo (ver Design/CONTEXT.md) — fonte única dos números que alinham o
 * anel, o botão "+", o Mini-menu e a pega entre si. O CSS (contentStyles.ts) é gerado daqui e
 * o JS (clique no "+", miniMenu.ts, pega) usa as mesmas constantes: mudar um número aqui
 * mexe em todos por igual.
 *
 *        ┌──── anel: RING_GAP branco + RING_LINE linha, por fora da caixa do bloco ────┐
 *        │  padding ACTIVE_PAD_Y / ACTIVE_PAD_X (margem negativa = texto não mexe)      │
 *        └──────────────────────────────── (+) ────────────────────────────────────────┘
 *                                           └ PLUS_SIZE, centrado na linha do anel
 */

export const RING_GAP = 3;                // folga branca entre a caixa do bloco e a linha
export const RING_LINE = 1;               // a linha do anel
export const RING = RING_GAP + RING_LINE; // distância da caixa do bloco à linha (Mini-menu encosta aqui)

export const ACTIVE_PAD_Y = 5;
export const ACTIVE_PAD_X = 8;

export const PLUS_SIZE = 20;
export const PLUS_HIT = PLUS_SIZE / 2 + 1; // tolerância do clique (raio + 1)
export const PLUS_CUT = 8;                 // cortes brancos à esquerda/direita do "+" (falha na linha)

export const GRIP_WIDTH = 20;
/** Esquerda da pega: centrada na linha do anel (RING à esquerda da caixa do bloco). */
export const gripLeft = (blockLeft: number) => blockLeft - RING - GRIP_WIDTH / 2;

export const GRIP_HEIGHT = 76; // pilha da pega: ▲ (20) + arrastar (36) + ▼ (20)
/**
 * Topo da pega (coords da janela): centrada na parte VISÍVEL do bloco e sempre dentro do espaço
 * útil [minTop, maxBottom] (entre barra de ferramentas e barra de estado). Centrar no meio do
 * bloco inteiro punha-a por cima da barra de estado / fora do editor em parágrafos longos.
 * null = pouco do bloco à vista (ou espaço útil menor que a pega) → esconder.
 */
export function gripTop(blockTop: number, blockBottom: number, minTop: number, maxBottom: number): number | null {
    const top = Math.max(blockTop, minTop);
    const bottom = Math.min(blockBottom, maxBottom);
    if (bottom - top < 12 || maxBottom - minTop < GRIP_HEIGHT) return null;
    const centered = (top + bottom) / 2 - GRIP_HEIGHT / 2;
    return Math.min(Math.max(centered, minTop), maxBottom - GRIP_HEIGHT);
}

/**
 * Centro vertical do "+": o ::after fica no fim do CONTEÚDO do bloco e desce --plus-dy; no
 * bloco ativo isso põe-no em cima da linha do anel (padding + RING abaixo do conteúdo).
 */
export const PLUS_DY_ACTIVE = ACTIVE_PAD_Y + RING;
export const plusCenterY = (contentBottom: number, isActive: boolean) =>
    contentBottom + (isActive ? PLUS_DY_ACTIVE : 0);

/**
 * Regra do bloco ativo para o content_style. !important: o CSS do livro (StyleContext,
 * gravado por livro, com uma cópia antiga desta regra) é injetado DEPOIS e ganharia.
 * Padding/margem não se aplicam aos marcadores de capítulo: têm geometria própria
 * (p.chapter-break*, mais específica, sempre ganhou à regra antiga) — senão saltavam.
 */
export const activeBlockCss = () => `[data-mce-psactive] {
  --plus-dy: ${PLUS_DY_ACTIVE}px;
  border-radius: 2px !important;
  box-shadow: 0 0 0 ${RING_GAP}px #fff, 0 0 0 ${RING}px #dbe2ea !important;
}
[data-mce-psactive]:not([class*="chapter-break"]) {
  padding: ${ACTIVE_PAD_Y}px ${ACTIVE_PAD_X}px !important;
  margin-left: -${ACTIVE_PAD_X}px !important; margin-right: -${ACTIVE_PAD_X}px !important;
}`;
