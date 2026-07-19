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
.noBreak { outline: 2px dashed #94a3b8; background: rgba(100,116,139,0.05); position: relative; padding: 2px 0; }
.noBreak::before { content: "Unido"; position: absolute; top: 0; right: 0; font-size: 9px; font-weight: bold; color: #475569; background: rgba(100,116,139,0.15); padding: 1px 5px; border-bottom-left-radius: 4px; pointer-events: none; }
[data-mce-psactive] { box-shadow: 0 0 0 3px #fff, 0 0 0 4px #dbe2ea !important; }
[data-mce-empty]::before { content: 'Escreve algo…'; color: #94a3b8; pointer-events: none; }
[data-mce-htmledit] { visibility: hidden !important; }
hr { border: none; box-sizing: content-box; height: 1px; background: #cbd5e1; background-clip: content-box; padding: 8px 0; width: 40%; margin: 1em auto; }
hr.divider-full { width: 100%; }
`;
}
