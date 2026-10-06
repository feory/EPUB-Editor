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

export const GRIP_HEIGHT = 76; // pilha da pega: ▲ (GRIP_ARROW) + arrastar (36) + ▼ (GRIP_ARROW)
export const GRIP_ARROW = 20;
// Faixa à volta da linha esquerda do anel onde o rato "está perto" (a pega aparece).
export const GRIP_NEAR_OUT = 36; // para fora (esquerda) da caixa do bloco
export const GRIP_NEAR_IN = 12;  // para dentro

/** O rato (coords do iframe) está perto da linha esquerda do bloco, à altura dele? */
export const nearGripLine = (x: number, y: number, r: { left: number; top: number; bottom: number }) =>
    x >= r.left - GRIP_NEAR_OUT && x <= r.left + GRIP_NEAR_IN && y >= r.top - 4 && y <= r.bottom + 4;

/**
 * Topo da pega: centrada na parte VISÍVEL do bloco e sempre dentro de [minTop, maxBottom]
 * (num parágrafo longo não fica fora de vista nem por cima das barras). null = pouco do bloco
 * à vista (ou espaço menor que a pega) → sem pega.
 */
export function gripTop(blockTop: number, blockBottom: number, minTop: number, maxBottom: number): number | null {
    const top = Math.max(blockTop, minTop);
    const bottom = Math.min(blockBottom, maxBottom);
    if (bottom - top < 12 || maxBottom - minTop < GRIP_HEIGHT) return null;
    const centered = (top + bottom) / 2 - GRIP_HEIGHT / 2;
    return Math.min(Math.max(centered, minTop), maxBottom - GRIP_HEIGHT);
}

/**
 * Zona da pega sob (x,y) — coords do iframe; blockLeft = caixa do bloco ativo, top = topo da
 * pega (gripTop). ▲/▼ nos GRIP_ARROW de cima/baixo, o meio arrasta.
 */
export type GripZone = 'up' | 'drag' | 'down';
export function gripZoneAt(x: number, y: number, blockLeft: number, top: number): GripZone | null {
    const left = gripLeft(blockLeft);
    if (x < left || x > left + GRIP_WIDTH || y < top || y > top + GRIP_HEIGHT) return null;
    const dy = y - top;
    if (dy < GRIP_ARROW) return 'up';
    if (dy > GRIP_HEIGHT - GRIP_ARROW) return 'down';
    return 'drag';
}

// ▲ · ⠿ · ▼ numa só imagem (um pseudo-elemento não tem filhos).
const GRIP_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='${GRIP_WIDTH}' height='${GRIP_HEIGHT}' viewBox='0 0 20 76'>`
    + `<g fill='none' stroke='#334155' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M7 12l3-3 3 3'/><path d='M7 64l3 3 3-3'/></g>`
    + `<g fill='#334155'><circle cx='8' cy='33' r='1.2'/><circle cx='12' cy='33' r='1.2'/><circle cx='8' cy='38' r='1.2'/><circle cx='12' cy='38' r='1.2'/><circle cx='8' cy='43' r='1.2'/><circle cx='12' cy='43' r='1.2'/></g>`
    + `<path d='M2 20.5h16M2 56.5h16' stroke='#e2e8f0'/></svg>`;

/**
 * Pega de mover: ::before do bloco ativo de topo, em CSS como o "+" (dentro do editor — nunca
 * por cima das barras). Centrada na linha esquerda do anel; a altura vem de --grip-y (posto no
 * body pelo JS: a pega fica a meio da parte visível do bloco). Só aparece com body.ps-grip-near
 * (rato perto da linha — o CSS não sabe onde está o rato) e não com o menu do "+" aberto.
 * Cortes brancos acima/abaixo na linha (como o "+"). Absoluta (posição estática no início do
 * conteúdo): fora do fluxo — no fluxo (ex. sticky) fazia perder a indentação da 1.ª linha.
 * Bloco vazio fica de fora: o ::before é o placeholder "Escreve algo…".
 */
export const gripCss = () => {
    const sel = ':is(p,h1,h2,h3,h4,h5,h6)[data-mce-psactive]:not([class*="chapter-break"]):not([data-mce-empty])';
    return `body:not(.mce-content-readonly) > ${sel}::before {
  content: ""; position: absolute; z-index: 2; display: block; box-sizing: border-box;
  width: ${GRIP_WIDTH}px; height: ${GRIP_HEIGHT}px;
  margin: calc(var(--grip-y, 0px) - ${ACTIVE_PAD_Y}px) 0 0 -${ACTIVE_PAD_X + RING + GRIP_WIDTH / 2}px;
  background: #fff url("data:image/svg+xml,${encodeURIComponent(GRIP_SVG)}") center / ${GRIP_WIDTH}px ${GRIP_HEIGHT}px no-repeat;
  border: 1px solid #e2e8f0; border-radius: 6px;
  box-shadow: 0 -${PLUS_CUT}px 0 0 #fff, 0 ${PLUS_CUT}px 0 0 #fff;
  cursor: grab; user-select: none;
  visibility: hidden; opacity: 0;
  transition: opacity .2s ease-in, visibility 0s linear .2s;
}
body.ps-grip-near:not(.mce-content-readonly) > ${sel}:not([data-mce-plusopen])::before {
  visibility: visible; opacity: 1;
  transition: opacity .22s ease-out .06s, visibility 0s linear .06s;
}`;
};

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
  margin-left: calc(var(--ps-ml, 0px) - ${ACTIVE_PAD_X}px) !important; margin-right: calc(var(--ps-mr, 0px) - ${ACTIVE_PAD_X}px) !important;
}`;
