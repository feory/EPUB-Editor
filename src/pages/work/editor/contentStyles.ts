import { activeBlockCss, PLUS_SIZE, PLUS_CUT } from './blockGeometry';

// content_style do editor: o CSS do livro + estilos só-editor (diff/spell/noBreak/
// marcadores de UI/hr). Os marcadores `data-mce-*` nunca exportam para EPUB.
export function buildContentStyle(currentCss: string): string {
    return currentCss + `
.diff-highlight { outline: 2px solid #10b981; background: #d1fae5 !important; border-radius: 2px; }
.diff-modify    { outline: 2px solid #f59e0b; background: #fffbeb !important; border-radius: 2px; }
.diff-char-add  { background: #d1fae5; color: #065f46; border-radius: 2px; padding: 0 1px; }
.diff-char-del  { background: #ffe4e6; color: #9f1239; text-decoration: line-through; border-radius: 2px; padding: 0 1px; opacity: 0.8; }
::spelling-error { text-decoration: underline wavy #e53e3e; text-decoration-thickness: 2px; }
.spell-error-highlight { text-decoration: underline wavy #e53e3e; text-decoration-thickness: 2px; cursor: pointer; }
.idx-link { text-decoration: underline dotted; text-decoration-color: #64748b; text-underline-offset: 3px; background-color: rgba(100, 116, 139, 0.08); border-radius: 2px; cursor: default; }
.comment-anchor { background-color: rgba(245, 158, 11, 0.18); border-bottom: 2px solid #f59e0b; cursor: pointer; }
.comment-anchor.comment-anchor-resolved { background-color: transparent; border-bottom-color: #cbd5e1; opacity: 0.6; }
.noBreak { outline: 2px dashed #94a3b8; background: rgba(100,116,139,0.05); position: relative; padding: 2px 0; }
.noBreak::before { content: "Unido"; position: absolute; top: 0; right: 0; font-size: 9px; font-weight: bold; color: #475569; background: rgba(100,116,139,0.15); padding: 1px 5px; border-bottom-left-radius: 4px; pointer-events: none; }
/* Bloco ativo: padding + anel (geometria em blockGeometry.ts — partilhada com o JS). */
${activeBlockCss()}
[data-mce-empty]::before { content: 'Escreve algo…'; color: #94a3b8; pointer-events: none; }
[data-mce-htmledit] { visibility: hidden !important; }
/* Botão "+" (inserir bloco): só CSS, ::after do bloco de topo, centrado na borda inferior.
   Sem position:relative no bloco (passaria a ser o contentor de span.pagebreak e deslocava o
   folio): absoluto na posição ESTÁTICA (fim do bloco) e centrado com cqw do próprio bloco.
   Existe SEMPRE (oculto) para aparecer e desaparecer com transição; visibility:hidden também
   o tira do hit-test (não tapa cliques no texto do bloco seguinte).
   Clique reconhecido por coordenadas em useBlockOverlays (pseudo-elementos não têm eventos).
   Com um bloco ativo (data-mce-psactive; body.ps-has-active, posta em setup.ts — NÃO usar :has,
   muito lento com milhares de blocos) só ESSE mostra o "+"; sem nenhum, qualquer bloco em hover.
   data-mce-plusopen = menu de inserção aberto (rato saiu do bloco, o "+" fica). */
body:not(.mce-content-readonly) > :is(p,h1,h2,h3,h4,h5,h6):not([class*="chapter-break"]) { container-type: inline-size; }
body:not(.mce-content-readonly) > :is(p,h1,h2,h3,h4,h5,h6):not([class*="chapter-break"])::after {
  content: "+"; position: absolute; z-index: 1; display: block; box-sizing: border-box;
  width: ${PLUS_SIZE}px; height: ${PLUS_SIZE}px; margin: calc(var(--plus-dy, 0px) - ${PLUS_SIZE / 2}px) 0 0 calc(50cqw - ${PLUS_SIZE / 2}px);
  border: 1px solid #e2e8f0; border-radius: 50%; background: #fff;
  /* 2 cópias brancas da própria forma, desviadas p/ os lados: cortam a linha da borda
     à esquerda/direita do círculo (ilusão de espaço). */
  box-shadow: 0 2px 6px rgba(15,23,42,.15), -${PLUS_CUT}px 0 0 0 #fff, ${PLUS_CUT}px 0 0 0 #fff;
  color: #334155; font: 400 15px/17px system-ui, sans-serif; text-align: center; text-indent: 0;
  letter-spacing: 0; text-transform: none; cursor: pointer; user-select: none;
  visibility: hidden; opacity: 0; transform: scale(.6);
  transition: opacity .2s ease-in, transform .2s ease-in, visibility 0s linear .2s;
}
/* A entrada usa a transição DESTE estado: atraso de 60ms evita o "piscar" ao passar o rato por vários blocos. */
body:not(.mce-content-readonly):not(.ps-has-active) > :is(p,h1,h2,h3,h4,h5,h6):not([class*="chapter-break"]):hover::after,
body:not(.mce-content-readonly) > :is(p,h1,h2,h3,h4,h5,h6):not([class*="chapter-break"]):is([data-mce-psactive]:hover,[data-mce-plusopen])::after {
  visibility: visible; opacity: 1; transform: none;
  transition: opacity .22s ease-out .06s, transform .22s ease-out .06s, visibility 0s linear .06s;
}
hr { border: none; box-sizing: content-box; height: 1px; background: #cbd5e1; background-clip: content-box; padding: 8px 0; width: 40%; margin: 1em auto; }
hr.divider-full { width: 100%; }
/* content_css:false tira o CSS default do TinyMCE — sem isto as pegas de resize de
   imagem/tabela existem no DOM (editor.plugins.core) mas ficam invisíveis/inertes
   (sem position:absolute nem dimensão), tal como o helper de dimensões e o clone
   fantasma durante o arrasto. Regras replicadas do skin oxide (content.inline.css). */
.mce-resizehandle { background-color: #4099ff; border: 1px solid #4099ff; box-sizing: border-box; height: 10px; width: 10px; position: absolute; z-index: 1298; }
.mce-resizehandle:hover { background-color: #2b7de9; }
.mce-clonedresizable { cursor: default; opacity: .5; outline: 1px dashed #000; position: absolute; z-index: 10001; }
.mce-resize-helper { background: rgba(0,0,0,.75); border: 1px; border-radius: 3px; color: #fff; display: none; font-family: sans-serif; font-size: 12px; line-height: 14px; margin: 5px 10px; padding: 5px; position: absolute; white-space: nowrap; z-index: 10002; }
`;
}
