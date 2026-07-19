# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


## Stack
Bun + SQLite + React + TinyMCE + Vite

## Comandos
```bash
bun install
bun run dev        # Vite frontend
bun run server     # Bun API backend
bun run dev:full   # ambos em paralelo
bun run build
bun run lint
```

## Versão atual: 0.9.4.3

### 0.9.4.3 | Lint pré-existente, reposicionamento de pesquisas, Editor CSS
- **27 erros de lint pré-existentes corrigidos** (não introduzidos nesta sessão, `/simplify` + `Explore` avaliaram o raio de impacto antes de mexer):
  - `AdminPage.tsx`: `err: any`→`AxiosError<{error:string}>` nos 3 `onError` de mutation; `(u as any).created_at`→`created_at?: string` adicionado a `AuthUser` (`auth-api.ts`).
  - `ChapterSidebar.tsx`: prop `isLargeBook` morta removida (interface+desestruturação+cascata em `WorkPage.tsx`, o `work.isLargeBook` subjacente continua usado noutros sítios).
  - `EpubPreviewModal.tsx`: `BookOpen` import morto removido; `setUseFallback` nunca chamado → só o getter fica desestruturado (`useFallback` continua lido 3x); `toc`/`flattenToc`/`sendCommand` tipados (`TocItem`, payload `{href?:string}`); `useEffect` do timer de fallback passou a ler `loading` via `loadingRef` (adicionar `loading` às deps recriaria o iframe/reader a cada mudança — regressão).
  - `WorkToolbar.tsx`: 6 imports mortos + 8 props nunca lidas (`isbn`/`title`/`isValidating`/`onToggleFocusMode`/`onUndo`/`onRedo`/`canUndo`/`canRedo`) removidas da interface e do JSX `<WorkToolbar>` em `WorkPage.tsx` — undo/redo e modo foco continuam a funcionar via `<WorkEditor>` (componente separado, intocado).
- **Pesquisa da HomePage** movida da navbar para a coluna de ações das tabelas "Em Progresso"/"Concluído": `searchControl` (JSX) computado uma vez em `HomePage.tsx`, passado como prop `searchSlot` a `InProgressTable.tsx`/`CompletedTable.tsx`, renderizado dentro do `<th>` vazio (idem no estado vazio, para não perder o acesso ao filtro quando a pesquisa não tem resultados). Input `w-full` (segue a largura da coluna, não um valor fixo); não aparece na vista de grelha (sem coluna de ações).
- **Pesquisa da Gestão de Utilizadores** movida do cabeçalho da página para dentro do bloco "Utilizadores (N)" (`AdminPage.tsx`), alinhada à direita.
- **Editor CSS (`StyleEditorModal.tsx`)**:
  - Bug do painel de busca nativo do CodeMirror a fechar a meio da digitação: causa raiz era `handleCssChange` (prop `onChange`) recriada a cada render — o `useCodeMirror` interno do `@uiw/react-codemirror` despacha `StateEffect.reconfigure` sempre que `onChange`/`extensions`/`basicSetup` mudam de referência, o que reconfigura todo o estado interno (painel de busca incluído). Fix: `extensions`/`basicSetup` viraram constantes de módulo; `handleCssChange` ganhou `useCallback`.
  - **Filtro de linhas** (pesquisa nativa): esconder linhas não correspondentes via decoração custom (`display:none`) desalinhava a gutter de números (não sabia que a linha tinha colapsado) — trocado por **fold nativo** (`foldEffect`/`unfoldAll` de `@codemirror/language`, a `foldGutter` já estava ligada no `basicSetup` e já entende folds corretamente). `computeHiddenRanges` calcula blocos de linhas não-correspondentes como posições fim-da-linha-anterior→fim-do-bloco (não fold de linha única — spans multi-linha).
  - Botão de pesquisa colapsado por default (ícone → input só ao clicar, mesmo padrão `searchOpen`/click-outside/Esc do resto da app).
  - Labels "CSS Universal" e "Preview em Tempo Real" removidas; painel "Secções" e área de Preview alinhados (`mt-11`) com o topo da caixa do editor (compensam a barra de pesquisa/preview acima).

### 0.9.4.2 | Reciclagem/Utilizadores (pesquisa+paginação) e Sistema de Partilha
- **Reciclagem** (`TrashModal.tsx`): pesquisa client-side (isbn/título/autor) + paginação 5/página (`src/components/Pagination.tsx`, novo, partilhado). Restaurar passa a exigir confirmação (par Check/X inline), mirror exato do padrão já usado para eliminar permanentemente — os dois passos de confirmação escondem-se mutuamente na mesma linha.
- **Gestão de Utilizadores** (`AdminPage.tsx`): pesquisa (email/role) + paginação 10/página com o mesmo `Pagination`. Modal de Edição do Utilizador: `Modal` interno ganhou prop opcional `onSave` (disquete no cabeçalho junto ao X, só quando presente — o modal de Criação mantém Cancelar/Criar no footer); form ligado via `useRef<HTMLFormElement>` + `requestSubmit()`. Tooltip `group-hover` (`Info`, mesmo padrão do `TocModal`/`CompareModal`) no campo de nova password: "Se deixar o campo vazio, a senha mantém" (substituiu o texto inline). Botão "Novo Utilizador" alinhado à cor do "Novo Ebook" (`bg-slate-100 hover:bg-slate-200 text-slate-600`).
- **Sistema de Partilha** (novo): dono de um ebook pode dar acesso de **edição completa** a outro utilizador; qualquer utilizador autenticado pode partilhar (não só admin); só 1-a-1 (sem bulk-share).
  - Backend: tabela `ebook_shares (ebook_isbn, user_id, shared_at)` PK composta (`server/database.js`), stmts `shareEbook`/`unshareEbook`/`listSharesForEbook`/`hasShareAccess`/`unshareAllForEbook` (chamado a par de `hardDeleteEbook` em `purgeOldTrash` e na rota de eliminação permanente — FK `ON DELETE CASCADE` só é declarativa, `PRAGMA foreign_keys` não está ligado, por isso a limpeza é explícita, mirror do padrão já usado para `grammar_cache`).
  - `listEbooksByUser` passa a `user_id = ? OR ebook_isbn IN (SELECT... ebook_shares WHERE user_id = ?)` (2 params). Gate de acesso por-pedido em `server/index.js` (~linha 128, guarda todas as rotas `/api/ebooks/:isbn/*`) estendido com `stmt.hasShareAccess` — sem isto o utilizador partilhado via lista mas leva 404 em todas as rotas de edição.
  - Rotas novas: `GET/POST /api/ebooks/:isbn/share`, `DELETE /api/ebooks/:isbn/share/:userId` (só dono/admin, `server/routes/ebooks.js` `isOwnerOrAdmin`). `GET /api/users` novo (leve, só `requireAuth`, devolve só id+email — nunca role/password; distinto do `/api/auth/users` admin-only já existente).
  - Frontend: `src/pages/home/ShareModal.tsx` (novo) — lista utilizadores (exclui o próprio) com checkbox, toggle chama share/unshare imediatamente (sem passo de "guardar"). Botão `Share2` ao lado de "Concluir" em `EbookCompact.tsx`/`InProgressTable.tsx`/`EbookGrid.tsx` (prop `onShare`); wiring em `HomePage.tsx` (state `sharingEbook`).
- **Polish pós-partilha**:
  - Pesquisa (Reciclagem, Gestão de Utilizadores, `ShareModal`) passou de input sempre visível para toggle ícone-lupa → input com foco automático (mirror do padrão já usado na pesquisa da HomePage): `searchOpen` state + `useRef`+`useEffect` fecha ao clicar fora (só se vazio) ou Esc.
  - `ShareModal`: título do ebook movido para uma 2ª linha (`text-xs`, por baixo de "Partilhar"); modal alargado (`max-w-md`→`max-w-lg`).
  - Modal "Novo Utilizador" (`AdminPage.tsx`): mesmo tratamento do modal de Edição — Cancelar/Criar removidos do footer, `onSave` no `Modal` liga a um `createFormRef` próprio.
  - Reciclagem: coluna "Expira em"→"Expira" + tooltip `Info` (mesmo padrão `group-hover`) com "Eliminados permanentemente após 30 dias." (o aviso deixou de estar no footer, que foi removido); modal com altura fixa (`h-[85vh]`, era `max-h`).
  - HomePage: estado vazio (0 ebooks) perdeu o ícone/círculo preto e o botão "Criar Novo Ebook" (já existe "Novo Ebook" na navbar); título `text-slate-700`→`text-slate-600`. `<main>` e os cartões de "Em Progresso"/"Concluído" passaram a `flex-1`/`flex flex-col` para ocupar sempre a altura toda; mensagens de lista vazia (`InProgressTable`/`CompletedTable`/`EbookGrid`/`EbookCompact`) centradas vertical+horizontalmente (`flex-1 flex items-center justify-center`, eram só `text-center py-12`). `tbody` das tabelas ganhou `border-b` (a última linha não tinha fronteira com o espaço vazio abaixo, agora visível com o card mais alto).
  - Toast de eliminação permanente (Reciclagem): "Registo eliminado permanentemente." → "Ebook eliminado."
  - `CreateEbookModal.tsx`: selects (Editora/Idioma) e input de data ganharam `text-text-main` explícito (mesma cor dos restantes campos — browsers renderizam `<select>`/`<input type=date>` num cinzento próprio por default).
- **`WorkToolbar.tsx` (navbar do editor)**: os 5 botões do topo (Guardar/Galeria/Ferramentas/Validações/Exportar) perderam `uppercase` e os ícones decorativos (mantido só o do Guardar; o `Loader2` do Exportar fica condicional a `isLoading`, é feedback funcional não decorativo); `text-xs`→`text-sm`; `min-w-[112px]` uniforme; separadores verticais entre Galeria/Ferramentas/Validações removidos; `font-mono`→fonte padrão da app.
- **`/simplify` (4 agentes: reuse/simplificação/eficiência/altitude) sobre a sessão de Reciclagem+Utilizadores+Partilha**: sem commits no repo para diffar, âmbito passado explicitamente aos agentes por lista de ficheiros. Aplicado: `src/components/ModalCloseButton.tsx` (novo) extrai o botão de fechar (`<X size={20}/>` + `p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all`) duplicado em **17 modais**; `font-bold` redundante removido de 5 spans em `WorkToolbar.tsx` (já herdado do botão pai). Ignorado (fora do âmbito ou risco/benefício baixo): hook de pesquisa colapsável partilhado (4x duplicado), extração do botão "Partilhar" isolado (já duplicado num padrão maior pré-existente em `EbookCompact`/`InProgressTable`/`EbookGrid`), `PRAGMA foreign_keys = ON`, passar `ebook` já obtido do gate para as rotas de partilha.

### 0.9.4.1 | Histórico/Comparação — agrupamento por dia + polish
- **Registos agrupados por dia** no `HistoryModal` (tab Histórico) e no `CompareModal` (tab Histórico): grupos derivados de `file.timestamp.split('T')[0]`; cabeçalho `sticky` clicável (chevron + data `toLocaleDateString('pt-PT', {weekday,day,month,year})` capitalizada + badge com nº de saves). `files` já vêm ordenados do mais recente → grupos em ordem.
- **Colapsáveis**: default = só o grupo mais recente (índice 0) aberto, restantes fechados. `overrides: Record<string,boolean>` guarda só o que o utilizador alterou à mão (default derivado do índice → sobrevive ao load async, sem `useEffect`/`set-state-in-effect`). Toggle: `!(date in prev ? prev[date] : defCollapsed)`. Label `text-sm`, espaço entre grupos `space-y-5` + `pt-3` no wrapper dos grupos.
- Sticky sem zona vazia: container do scroll passou a `px-2 pb-2` (sem padding-top) + `pt-3` no wrapper dos grupos (padding que faz scroll → 1º cabeçalho afastado das tabs, mas cabeçalho encosta flush ao topo-0 ao rolar).
- Tooltip por CSS (`group-hover`, não `title` nativo — no `<svg>` do lucide não disparava de forma fiável): ícone `Info` junto ao título do `CompareModal` ("Comparação do texto do editor com uma versão do histórico") e do `TocModal` ("Arraste para reodernação"). Fundo `slate-100`/texto `slate-700`.
- `CompareModal`: texto inline removido do corpo (passou a tooltip); ícones removidos das tabs Ficheiro/Histórico; altura fixa `h-[80vh]` (era `max-h`); dropzone de upload ocupa toda a altura (`flex-1`, sem `py-12`).
- `HistoryModal`: altura fixa `h-[80vh]`; estado vazio da tab EPUBs centrado verticalmente, texto "Nenhum Epub gerado".
- `StyleEditorModal` (Editor CSS): largura constante `max-w-7xl`, altura `h-[70vh]` → `h-[95vh]` só ao abrir a Preview (antes ambos fixos). Botão Cancelar + footer removidos; Guardar passa a ícone de disquete junto ao X no cabeçalho.
- `FontModal`: mesmo tratamento (disquete junto ao X, sem footer); tamanho igualado ao `HistoryModal` (`max-w-lg h-[80vh]`); área de pré-visualização em `flex-1` (ocupa o espaço restante).
- **Botão de fechar uniformizado** em todos os modais do projeto: `Plus className="rotate-45"` (ícone de + rodado 45°) substituído por `<X size={20}/>` com `p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-all` (era `w-8/10 h-8/10 rounded-full`). Cobertos: Admin, CompletedTable, CoverModal, CreateEbookModal, TrashModal, EpubMappingModal, ChapterSidebar (EditTitleModal), EpubPreviewModal, ConversionsModal, HistoryModal, ImportOptionsModal, MetadataModal, ShortcutsModal, ValidationModal, CompareModal, TocModal.
- Lint: toggle reescrito de ternário-statement (`a ? b : c;`) para `if/else` (evita `no-unused-expressions`).

### 0.9.4.0 | Comparação: ficheiro + histórico com diff entre saves
- **Diff entre duas versões guardadas** (saves), reutilizando o motor existente: `diff.worker.ts` (`diffParagraphs`, LCS char-level); `extractParagraphs` movido para `src/utils/diff-text.ts` (partilhado, +teste); `CharDiff` extraído para `src/pages/work/components/DiffCharView.tsx`.
- `src/pages/work/hooks/useVersionDiff.ts`: worker próprio, isolado do editor (sem `highlightDiffContent` → evita o caveat dos spans `delete`). `compareVersions(a,b)` carrega os 2 saves (`ebooksApi.getContent`+`decompressHtml`), ordena antigo→novo, corre o worker (editor=novo/ref=antigo → insert=verde/adicionado, delete=rose/removido).
- **Modal de Comparação com 2 separadores** (`CompareModal.tsx`, Ferramentas → "Comparação"): **Ficheiro** (upload DOCX/DOC/TXT/PDF → compara com o editor) e **Histórico** (checkbox em 2 saves → comparar). Ambos alimentam o mesmo `DiffSidebar`. `HistoryModal` voltou a ser só-restaurar.
- `useEbookHistory` expõe `refetchHistory` (a query é `enabled:false` sem o modal aberto; `refetch()` na mesma carrega a lista para o separador Histórico sem abrir o modal de histórico).
- Resultado no **DiffSidebar** (painel direito, não no editor): lista de linhas alteradas + clicar salta para o parágrafo (`scrollToContent`). Labels parametrizáveis (`labelInsert`/`labelDelete`, default Editor/Ficheiro; versões → "Mais recente"/"Mais antiga"); cabeçalho com as 2 datas.
- DiffSidebar adaptado ao estilo das outras sidebars: `fixed right-4 top-[89px] bottom-8 w-[500px] rounded-2xl border overflow-hidden`. `anySidebarOpen` passou a incluir `versionDiff.open` (senão o `<main>` não reservava `pr-[520px]` e o painel sobrepunha o editor). Abrir gramática/validação/galeria fecha ambos os diffs (efeito central em WorkPage).
- `useBodyScrollLock` (`src/hooks/`) novo: bloqueia scroll do body enquanto um modal está montado (aplicado a TODOS os modais; `active` opcional p/ os que auto-gateiam por `isOpen`).
- Lint: 6 erros pré-existentes do WorkPage corrigidos (react-hooks v6 + `no-explicit-any`): `any`→`unknown`, `processFile` memoizado, callbacks de resolução destructurados de `work` (deps estáveis), `set-state-in-effect` com disable justificado.

### 0.9.3.9 | Editor de TOC + polish do mini-menu
- **Editor de TOC** (reordenar + renomear capítulos), duas superfícies partilhando a lógica de `useEbookWork`:
  - Núcleo puro `src/utils/toc.ts` (+ `toc.test.ts`, `bun test`): `subtreeRange`, `moveChapters` (reordena por SUBÁRVORE — um `h1` arrasta os `h2`/breaks filhos até ao próximo `h1`; folhas movem sozinhas; soltar dentro da própria subárvore = no-op), `renameChapterPart` (atualiza `data-title` do marcador + texto do heading h1/h2; break só data-title; escapa HTML).
  - `useEbookWork`: `handleReorderChapter(from,to)` e `handleEditChapterTitle` (agora todos os níveis, não só breaks) — operam sobre as `parts` do split, `join`, `LOAD_CONTENT` + save. Rename restaura a entrada ativa anterior (`CHANGE_CHAPTER` após o `LOAD_CONTENT` que a punha a -1).
  - `ChapterSidebar`: arrastar para reordenar (grip, indicador de drop, zona final), pencil de renomear em todos os níveis.
  - `TocModal.tsx` (Ferramentas → "Editor de TOC"): lista com drag + renomear inline + indentação por nível.
- Drag: side-effect (`onReorderChapter`) fora do updater de `setState` — dentro dele o StrictMode corria-o 2× (toast duplo). Ghost de arraste com fundo sólido `slate-200`+sombra via DOM no `dragstart` (snapshot nativo saía branco); origem a `opacity-40`.
- Mini-menu de bloco: botão "Mais estilos" agora é um ⋮ (`ps-vdots`) no canto esquerdo, sem tooltip; alinhamento (`blockalignmenu`) logo à direita; toolbar `blockalign` separada removida (itens fundidos em `parastyles`/`headingstyles`).
- "Mais estilos" abre overlay React em **2 colunas** (`styleMenu`, ancorado ao pop; TinyMCE só faz dropdown 1 coluna) — aplica via `formatter.toggle` (h1-3 sincronizam marcador). Fecha: 2º clique no ⋮ (guard 300ms anti-reabrir), clicar noutro botão/fora (listener global `mousedown` capture), ou rato a sair do menu (`onMouseLeave`). Cabeçalho "Estilos".
- Mini-menu só com seleção COLAPSADA (`editor.selection.isCollapsed()` no predicate) — em seleção de texto mostra-se só o bubble, não os dois menus sobrepostos.
- Marcador de capítulo no editor: removido o prefixo "Capítulo - " (`content: attr(data-title)`); `patchLoadedCss` tira o prefixo do CSS já guardado de livros antigos.
- Validação de links: botão "Corrigir espaçamento (capítulo atual)" → só "Corrigir".

### 0.9.3.8 | Import IDML — capítulos "Índice" + títulos disfarçados
- Título disfarçado de corpo (`isHeuristicTitle`): parágrafo centrado, ≤60 car, com run ≥13pt Medium/Bold vira `<h1>` mesmo que o estilo (ex. TEXTO) esteja mapeado para uma classe — apanha "Índice" e "Índice remissivo" (que usam estilo de corpo). Vence a classe de corpo; só não se aplica a headings mapeados à mão.
- Capítulos "Índice"/"Índice remissivo": o corpo NÃO herda o estilo de import mapeado — usa auto (corpo simples + `indentStyle` do `LeftIndent`). `renderStory` rastreia `inIndexChapter` (abre no título heurístico) e força `{tag:'p'}`/`mapped=false` nos `<p>` lá dentro.
- `inIndexChapter` FECHA em qualquer heading OU numa abertura de capítulo (`rawMap.cls === 'drop-cap'`): a TOC "Índice" no início do livro sangrava para o corpo seguinte e despia a classe `drop-cap` do 1º capítulo → `insertTitleBlocks` perdia a âncora e os títulos deslocavam-se (título do cap. 1 com conteúdo do cap. 3). Fechar no drop-cap realinha.

### 0.9.3.7 | Refatorização do editor + polish dos overlays
- `WorkEditor.tsx` (1846 linhas) refatorado por extração behavior-preserving para `src/pages/work/editor/`: `config.ts` (plugins/toolbar/style_formats/text_patterns/slash), `contentStyles.ts` (`buildContentStyle`), `icons.ts` (`registerEditorIcons`), `setup.ts` (`createEditorSetup(deps)` — todo o `init.setup`), `useBlockOverlays.ts` (hook: estado/refs/handlers dos overlays + `wireEditor`), `overlays/BlockOverlays.tsx` (JSX), `types.ts`. Componente ficou orquestrador (~750 linhas); métodos `useImperativeHandle` intactos.
- `setup.ts` tipa o `editor` com o `Editor` real do TinyMCE (sem novos `any`); alias global `TinyMCEEditor = any` partilhado por `types.ts`.
- Mortos removidos: botões `pssmall`/`psbold` (nunca colocados), ramo `hr-full`; `on('init')`/`on('remove')` consolidados. Helper `iframeOf(editor)`.
- Testes de regressão (`editor/__tests__/refactor.test.tsx`, `bun test` + happy-dom): content_style/config byte-idênticos ao backup, execução de `setup`+`wireEditor` contra editor simulado (superfície de registo, `syncChapterMarker`, slash `hr`), render de todos os overlays.
- Pega (grip) reformulada: pílula única fundo branco (↑ / arrastar `h-9` / ↓); setas `moveBlock('up'|'down')` reordenam o bloco de topo uma posição. Só aparece com o rato no gutter esquerdo do bloco (`lastMouseX` ∈ `br.left-36 … +12` e à altura). Centragem por offset (`midY-38`, sem `translateY` — colidia com `plusPop`).
- Overlays escondem com **fade-out** suave (opacity 300ms ease-out, unmount aos 340ms): pega e botão "+" (estado `gripFading`/`addBtnFading`; `fadeOutGrip`/`fadeOutAddBtn` com timer, cancelados ao reaparecer). Pega também faz fade no scroll.
- Divisória: botão de lixo (cinzento) para eliminar (`deleteHr`), ao lado de Pequena/Larga.
- Edição HTML inline: fundo `bg-slate-50`; clicar noutro bloco (`mousedown`) fecha e descarta.
- Botão "+" no scroll: fica COLADO à borda inferior do bloco (`repositionAddBtn` recalcula só pela borda, sem o gate do rato — não pisca nem se descola); só esconde se o bloco sair da vista. NÃO se reavalia posição em scroll (`onScroll` ≠ resize).
- Marcador de capítulo (`h1/h2` via menu de estilos): `FormatApply`/`FormatRemove` dispara `syncChapterMarker` (o dropdown "styles" aplica via `formatter`, não via `FormatBlock`/`ExecCommand`) — cria/remove o marcador tal como o mini-menu. Idempotente com o `ExecCommand`.
- Marcador de capítulo: placeholder "Escreve algo…" excluído (`refreshEmptyMarker` ignora `chapter-break*` e `&nbsp;`/` `); escrita bloqueada dentro do marcador (keydown: caracteres e Enter travados; setas/Backspace/Delete/atalhos permitidos).
- Import IDML: `renderTitleBlock` emite `<h1>` simples (era `<h1 class="chapter-break">`, tratado como quebra SEM título → o título sumia); bullet literal `•` colado a formatação (`•<em> …`) removido do 1º text node via `BULLET_STRIP_RE` (espaço opcional) — deixa de duplicar o marcador da `<li>`.

### 0.9.3.6 | Editor estilo Notion
- Botão "+" (aresta inferior do bloco ativo, só com o rato abaixo da borda) abre menu de INSERÇÃO em 2 colunas (Parágrafo, Título 1-3, Citação, Texto pequeno, Nota de rodapé, Imagem, Divisória) — insere novo bloco a seguir. Menu abre para cima; enquanto aberto esconde mini-menu e pega e mantém o "+" visível; fecha em scroll.
- Pega de arrastar (gutter esquerdo, centrada na borda): arrastar reordena o bloco de topo (linha indicadora); clicar abre menu (Duplicar, Eliminar, Título 1-3, Parágrafo, Citação).
- Menu "/" (slash, `addAutocompleter`): inserir/converter bloco reusando formats/comandos.
- Bubble de formatação na seleção de texto (`quickbars_selection_toolbar`: negrito, itálico, superscript, versaletes, pequeno, link).
- Placeholder "Escreve algo…" no `<p>` vazio focado (`[data-mce-empty]::before`, temp attr).
- Divisória `<hr>` (menu "+"/slash + `text_patterns ---`); controlo ao passar o rato sobre o `hr` para alternar Pequena (40%) / Larga (100%, `.divider-full`).
- Mini-menu de bloco: alinhamentos agrupados num dropdown; botão "Editar HTML" (`< >`); removidos "Texto Pequeno" e "Negrito" (ficam no bubble/menu "+"). Borda de seleção fina e cinzenta clara com folga (`box-shadow` branco + anel).
- Editar HTML inline (mini-menu `edithtml`): esconde o bloco (`data-mce-htmledit`, temp attr) e mostra um textarea no lugar com o outerHTML limpo (sem `data-mce-*`); Guardar (disquete/⌘Enter) → `setOuterHTML`, Cancelar (X/Esc) restaura. Altura proporcional ao bloco; esconde (sem desmontar) ao sair da vista em scroll.

### 0.9.3.5 | Importação EPUB antigo + Editor
- Importação de EPUB antigo (HomePage): modal de mapeamento de classes legacy → estilos do editor. `scanEpubClasses` lista as classes usadas (contagem + amostra) só para EPUBs de plataforma antiga; `extractEpub(file, mapping)` aplica a escolha do utilizador (`__keep__`/`__drop__`/classe), com fallback à auto-deteção quando não mapeado. EPUBs da própria app importam direto (sem modal).
- Cabeçalhos h1/h2/h3 do EPUB antigo aparecem no modal (por tag) e são remapeáveis (`applyHeadingMapping`: troca de nível, vira parágrafo, ou remove).
- Editor: botão "+" flutuante na aresta inferior do bloco ATIVO (o que tem a borda preta). Só aparece com o bloco selecionado E o rato abaixo da linha da borda; some ao desativar (2º clique → `hiddenBlock`), ao sair do editor (grace de 120ms p/ alcançar o botão) ou ao perder foco. Clica → insere `<p>` vazio a seguir e leva o cursor. Overlay React fora do iframe (posicionado por `getBoundingClientRect` + offset). Entrada suave via keyframe `plusPop`.
- Editor: mini-menu de bloco só na parte superior (`forcePopAbove` reposiciona o `.tox-pop`; esconde quando não cabe em cima). Os 3 alinhamentos agrupados num único dropdown (`blockalignmenu`).

### 0.9.3.4 | Refinamento UI
- Página de login: logo removido, botão e textos principais em cinzento escuro.
- Cores dos títulos (h1/h2/h3) uniformizadas para cinzento escuro em toda a app.
- Botões primários de ação (Guardar, Criar, Entrar) alterados para cinzento escuro.
- Modais de admin, criação de ebook, editor CSS, metadados e reciclagem: ajustes de cor e texto.
- Título do modal de utilizador alterado de "Editar Utilizador" para "Edição do Utilizador".
- Reciclagem: modal aumentado, subtítulo Dublin Core removido, texto do rodapé simplificado, hover dos botões em cinzento, título sem rasurado.
- Ao clicar em eliminar, o botão de editar/restaurar é ocultado durante a confirmação.
- Tabela de concluídos: ícone do livro removido do título; cabeçalho "Ações" removido.
- Vista de grelha: título maior, botões ocupam largura total do card, ícones centrados.
- Modos de visualização "Compacto" e "Estante" removidos da homepage (ficam Tabela/Grelha).
- Homepage: logo removido do cabeçalho; título "Epub Manager" em cinzento escuro.
- Capítulos desacoplados do heading: marcador `chapter-break-h1|-h2` (com `data-title`) antes de cada `h1/h2` passa a ser a fronteira; `h1/h2` cru deixa de partir e o heading fica intocável no corpo. Criado no import/editor; livros antigos migram ao abrir.
- Rótulo só-editor "Capítulo - {título}" (cinzento, atualiza ao vivo ao editar o heading); marcador removido na exportação EPUB.

### 0.9.3.3 | Importador IDML — figuras e tabelas
- Índice de Figuras/Tabelas excluído dos alvos de correspondência (`data-indice`); imagens/tabelas deixam de ir parar lá.
- Numeração decimal capítulo.figura ("2.1", "11.4") reconhecida (antes só o nº inteiro).
- Legenda de tabela casada por STORY (não por spread) — evita atribuir a legenda de uma tabela a outra na mesma spread.
- Estilo de legenda "Figura titulo" (além de LEGENDAS/TXT) reconhecido; tabelas duplicadas por story threaded deduplicadas.
- `insertFigures`: legenda já presente no corpo é o alvo preferencial (evita casar com menção textual incidental); visual fica DEPOIS da legenda.
- Legenda de figura (estilo "Figura titulo", story de frame único) deixa de ser dropada do corpo.
- `placeInlineFigures`: casar imagem↔legenda por NÚMERO (não por ordem); imagem passa a ficar DEPOIS da legenda.
- Page-list: folio pode estar no CABEÇALHO (topo) além do rodapé — zona auto-detetada por livro (`monotonicScore`), corrige livros com poucas páginas detetadas.

### 0.9.3.2 | Importador IDML
- Notas mistas (asterisco + numerada) → duas notas separadas.
- Notas manuais (`Notas manuais` / `Notas`) → importadas como notas normais.
- Asterisco no corpo do texto mantido.
- Melhoramentos na importação: índice e textos soltos.

### 0.9.3.1 | Importação EPUB
- Botão 'Importação' na HomePage.
- Metadados extraídos do OPF (título, autor, editora, idioma, etc.).
- Fix de imagens `src="placeholder"` no editor.
- Fix de erro 400 quando o EPUB não tem `dc:creator`.

### 0.9.3 | Importação EPUB Legacy
- Importa EPUBs da plataforma antiga (2018) com adaptação de estilos.
- Mapeamento de classes legacy para as novas (`p-indent`, `p-top`, `p-small`, etc.).
- Notas de rodapé legacy convertidas para o modelo atual.
- Capa do EPUB ignorada no upload para evitar erro 413.

### 0.9.2.9 | Formatação IDML e Import
- Ordinais sobrescritos (`6.º`, `Artigo 3.º`) preservados do IDML.
- Marcadores de alínea a negrito preservados.
- Novos estilos `p-italic` e `p-bold-italic`.
- Parágrafos totalmente negrito/itálico convertidos para classe de estilo.
- h4-h6 removidos das opções de mapeamento de import.

### 0.9.2.8 | Importador EPUB
- Novo importador `epub-importer.ts` para reabrir EPUBs da própria app (round-trip).
- Conversão de notas, page-list e imagens do EPUB para o formato do editor.
- Títulos de quebra recuperados do `nav.xhtml`.

### 0.9.2.7 | Performance e UI
- Galeria: contagem de uso de imagens otimizada (1 scan + debounce).
- Lazy load do pdfjs na HomePage.
- Virtualização de listas com `react-virtuoso`.
- Pipeline EPUB: tokenização de entidades e otimização de imagens.
- Fix do dropdown da navbar sobre o editor.

### 0.9.2.6 | TypeScript e React 19
- Correções de tipos para a migração React 19.
- Ajustes nos callbacks do TinyMCE (`editor.getBody()`).
- Refs e tipos de `useRef` atualizados.

### 0.9.2.5 | UI / Editor
- Seletor de fonte do editor (preview, não exportada).
- Fontes Crimson Text, Lora, EB Garamond e Source Serif 4.
- Preview ao vivo na modal de fontes.

### 0.9.2.4 | Importador IDML
- Formatação por estilo de carácter (negrito, itálico, versaletes).
- Estilo mapeado pelo utilizador vence a auto-deteção.
- Recuo de bloco (`LeftIndent`) do IDML honrado.

### 0.9.2.3 | Importador IDML
- Coletâneas: títulos de artigo recuperados de stories separadas.
- Figuras EPS rasterizadas server-side com Ghostscript.
- Estilo `CAPITULAR` → `drop-cap`.

### 0.9.2.2 | Importador IDML
- Suporte a livros multi-documento (vários `.idml` no zip).
- Figuras em PDF na `Links/` convertidas para JPEG.
- Colocação de figuras com legenda inline no corpo.
- Page-list mais robusto a outliers.

### 0.9.2.1 | Page-list
- Page-list do EPUB gerada a partir do PDF de impressão.
- Marcador de página visível no editor (margem direita).
- Navegação por página real do impresso no EPUB exportado.

### 0.9.2 | Importador IDML
- Novo importador IDML (`idml-importer.ts`).
- Estilos de parágrafo nomeados, notas `<Footnote>` ancoradas, parágrafos inteiros.
- Junção de parágrafos partidos por página no DOCX via XML.

### 0.9.1 | Colaboração
- Lock de concorrência: 2º utilizador entra em modo leitura.
- Heartbeat de presença por `clientId` (não por userId).
- Modal de metadados no estado 'Concluído'.

### 0.9.0 | Galeria e UI
- Galeria de imagens funcional (arrastar, substituir, localizar, download).
- Tema cinzento uniforme.
- Reorganização da navbar e menu Ferramentas.

### 0.8.9.6 | Formatação e Exportação
- 'União de Parágrafos' alargada a `p-bold` e corridas de negritos.
- Superscript das notas forçado na exportação EPUB.

### 0.8.9.5 | Exportação e UX
- Versaletes com recapitalização automática.
- CSP `blob:` no nginx para preview EPUB.
- Contraste das notas no ACE corrigido.
- Notificação de validação persistente.

### 0.8.9.4 | Performance
- Consolidação de parágrafos O(n²) → O(n).
- Iteração de parágrafos em streaming (menor pico de memória).

### 0.8.9.3 | Validações
- Validação e correção de links partidos por espaços.
- Integração no painel de Validações.

### 0.8.9.2 | Importador Word
- Citações recuadas detetadas como `p-quote`.
- Fix de notas a ganharem estilo de miolo.

### 0.8.9.1 | Editor
- Alinhamento de imagens, versaletes, mini-menu de bloco.
- Fixes de exportação e contorno de títulos.

### 0.8.9 | Ferramentas
- Ferramenta 'Limpar Índice' para índices remissivos.

### 0.8.8 | Importador Word
- Mapeamento interativo de estilos Word para o editor.
- Modal de opções de importação com preview.

### 0.8.7 | Importador Word
- Falas de romance convertidas de bullets Word para travessão.
- Fix de consolidação de parágrafos com classes.

### 0.8.6 | Importador Word
- Fix de referências de nota falsas.
- Pré-processamento de superscripts no XML do docx.
- Notas partidas entre páginas fundidas corretamente.

### 0.8.5 | Importação e Estilos
- Indentação invertida: `<p>` base sem indentação, `.p-indent` com indentação.
- Modal de opções de importação com 4 checkboxes.
- Ficha Técnica automática no início do import.

### 0.8.4.4 | Performance e Sessão
- Fix de duplo refresh em StrictMode (sessão fechada em dev).
- Otimizações de performance: cache grammar, gzip, sourcemap, SQLite cache.
- Memoização de componentes da sidebar.

### 0.8.4.3 | Robustez
- Check de ISBN duplicado (409 em vez de 500).
- Safe unlink e hard delete mais robustos.
- Limites e logs operacionais.

### 0.8.4.2 | Segurança
- Path traversal: validação de `isbn` em todas as rotas.
- Limites de upload e sanitização DOM.
- Headers de segurança no nginx.

### 0.8.4.1 | Segurança e Bugs
- Atomicidade em `deleteUser` e `realpathSync`.
- Limites no grammar e EPUB service.
- ErrorBoundary em todos os `Suspense`.

### 0.8.4 | Importador Word
- Bullets com travessão convertidos em falas.
- Letras capitulares (`drop-cap`).
- Consolidação de parágrafos partidos.

### 0.8.3.2 | Comparação
- Fix de diff com blocos formatados (`<em>`, `<strong>`).
- Diff highlights não contaminam `htmlContent`.
- PDF emite `\n` por linha.

### 0.8.3.1 | Comparação
- Diff ao nível do carácter (LCS).
- Suporte a `.pdf` e `.doc` na comparação.
- Cursor posicionado após diffs.

### 0.8.3 | HomePage
- 4 modos de visualização (tabela/grelha/compacto/estante).
- Menu do utilizador com avatar e opções.
- Fixes de UI e configuração Docker.

### 0.8.2.1 | Workflow
- Ebooks concluídos não abrem editor.
- Invalidação de cache ao mudar estado.

### 0.8.2 | Bug fixes
- Memory leaks, regex globais, grammar JSON, imagens no EPUB, botões admin.

### 0.8.1 | Auth
- Refatorização de auth: helpers, hashes, roles, SQL filters.

### 0.8.0 | Auth
- Auth multi-user: JWT + refresh tokens, Argon2id, rate limit, isolamento de dados.

### 0.7.3 | UI
- Fix cache capa, crop 1400px, download EPUB homepage, botões ícone-only.

### 0.7.2 | Editor
- Fix classes `<p>`, botão Box/noBreak, charmap, atalho foco, gramática.

### 0.7.1 | Editor
- Botões outdent/indent; fix correspondência sequencial de notas.

### 0.7.0 | Refatorização
- Refatorização em 6 fases sem breaking changes: server, hooks, galeria, EPUB, páginas, editor.

### 0.6.5 | Grammar
- Cache grammar SQLite, resolução local, binary search.

### 0.6.4 | Editor
- CodeMirror CSS editor, navegador de secções, preview isolado, CSS por ISBN.

### 0.6.3 | Exportação EPUB
- Capítulos sem título, entidades HTML, capa `object-fit`, drop cap, notas Apple Books.

### 0.6.0 | Editor
- 'Capítulo sem Título': `<hr>` → `<h1 class="chapter-break">`.

### 0.5.7 | Performance
- Fix N+1 imagens, Object URL leak, refetch por keystroke, notificações.

### 0.5.6 | UI
- Reciclagem 30 dias; ocultação de botões durante confirmação.

### 0.5.5 | UI
- TinyMCE local, pesquisa ebooks, notificação conclusão, eliminação registo.

### 0.5.0 | Comparação
- Comparação com ficheiro Word/Text.

### 0.4.x | Validação e Galeria
- Validação ACE/EPUB, galeria de imagens completa, limpeza HTML, notas semânticas EPUB3.

### 0.3.x | Editor
- Web workers, undo/redo, preview EPUB, validação notas, lazy load capítulos.

### 0.2.x | Editor
- Edição por capítulos, tipografia/hifenização, importação Word/HTML, gramática.

### 0.1.x | Infra
- Migração Bun, SQLite prepared statements, hot reload, bundling.

### 0.0.x | MVP
- PDF→HTML, editor TinyMCE, notas, capas, histórico, EPUB básico.

## Notas técnicas

### Estrutura / Capítulos
- Indentação (0.8.5+): `<p>` base sem `text-indent`; indentação é opt-in via `.p-indent` (2em editor / 1.5em EPUB).
- `.p-non-indent` só existe para conteúdo antigo (livros pré-0.8.5); `html-cleaner` continua a aplicá-la às alíneas.
- Capítulos (0.9.3.4+): a fronteira é o MARCADOR `<p class="chapter-break-h1|-h2" data-title>` inserido ANTES do heading (o heading fica intocável no corpo); `chapter-break` plano = quebra sem título. `CHAPTER_SPLIT_PATTERN` divide nos marcadores + `hr.chapter-break` legacy — NÃO em `h1/h2` cru.
- `insertChapterMarkers` (dentro de `cleanEditorHtml`) cria os marcadores no import/load; gate: se já há `chapter-break-h[12]` não recria (marcador apagado à mão fica apagado). `cleanHeadings`→`refreshChapterMarkers` só atualiza o `data-title` a partir do heading seguinte (nunca cria/remove).
- Classificação de parte via `classifyChapterPart` (partilhado por `useChapterSync` e `content.worker`): nível pelo sufixo `-h1/-h2` do marcador, título por `data-title` (fallback ao heading). `level: 'break'` = marcador `chapter-break` plano ou `hr` legacy.
- Editor: `syncChapterMarker` (WorkEditor) trata "editor também" por EVENTO (`ExecCommand FormatBlock` + toggles h1/h2/h3), nunca `NodeChange`; handler `input` atualiza o `data-title` ao vivo. `handleEditChapterTitle` edita o `data-title` do marcador/`hr`.
- Export EPUB (`epub/chapters.ts`): parte nos marcadores e REMOVE o marcador do corpo exportado; título via `data-title`, heading mantém-se.
- `chapters[]` (sidebar) tem de ficar 1:1 com as parts do split — nunca filtrar/descartar entradas (usar título fallback "Sem Título N").
- `UPDATE_CONTENT` deve SEMPRE levar `chapterIndex` explícito — nunca confiar em `state.activeChapterIndex` para escrita.
- Extração de título de heading: substituir `<br>` por espaço ANTES do strip HTML.
- Import Word: `<p>Capítulo N</p>` imediatamente antes de `<h1>` → funde com o `<h1>`.
- Autosave a cada 5 minutos via refs estáveis.

### Importação
- `ImportOptions` definido em `html-cleaner.ts`; pipeline: `cleanEditorHtml` → `applyImportOptions` → `prependFichaTecnica`.
- Ficha Técnica: marcador `chapter-break` (sem heading) automático no topo de cada import; `<p>` antes do 1º heading → `p-small` + `p-non-indent`.
- `prependFichaTecnica` tem de correr DEPOIS de `applyImportOptions`.
- `applyImportOptions` indentação: `INDENT_CONTROLLED_CLASSES` vs `SPECIAL_INDENT_CLASSES`.
- `noIndentAfterBold`/`topOnBoldParagraphs` forçam non-indent, respeitando só `SPECIAL_INDENT_CLASSES`.
- Capa do EPUB legacy ignorada no upload para evitar erro 413.
- Mapeamento de classes do EPUB antigo (0.9.3.5+, `epub-importer.ts`): `openEpub` partilha OPF/spine entre scan e extract; `isLegacyEpub` = spine não-`.xhtml`.
- `scanEpubClasses` só corre para EPUBs antigos → `EpubClassInfo[]` (`name`, `count`, `sample`, `suggested`); `autoTarget` calcula a sugestão (NEW_CLASSES/`LEGACY_CLASS_MAP`/`small`→p-small/`__drop__`).
- `extractEpub(file, mapping?)` → `adaptLegacyClasses(body, small, mapping)`: `mapping[classe]` vence (`__keep__`/`__drop__`/classe(s)); sem entrada → auto (fallback). `footnote` sempre forçado a `footnote`.
- Cabeçalhos por tag: `scanEpubClasses` inclui h1/h2/h3; `applyHeadingMapping` (antes de `mergeChapterHeadings`) troca nível / vira `<p class>` / remove.
- `EpubMappingModal.tsx` (só-antigos): `TARGET_OPTIONS` curado; valor sugerido combinado (ex. `p-center p-bold`) entra como opção extra do `<select>`. HomePage: `scanEpubClasses` no file-pick → modal se legacy, senão import direto.

### Editor — mini-menu e botão "+"
- Botão "+" (0.9.3.5+, `WorkEditor.tsx`): overlay React FORA do iframe (`position:fixed`, posicionado por `getBoundingClientRect` + offset do iframe) — evita `body{position:relative}` que deslocaria `span.pagebreak{position:absolute}`.
- Só aparece com bloco ATIVO (foco + `data-mce-psactive`, i.e. `block !== hiddenBlock`) E `lastMouseY` abaixo da linha da borda inferior (`br.bottom-2 … +PLUS_BAND`). `evalAddBtn` reavalia em `mousemove`/`NodeChange`/`input`/scroll.
- Esconde: perda de foco (`blur`), 2º clique (`hiddenBlock`), ou saída do editor (`getBody().mouseleave` com grace de 120ms; botão `onMouseEnter` cancela p/ ser clicável). Clamp à janela (`0..innerHeight`) + reavaliação em scroll externo/`resize` (`window` capture, removido no `remove`).
- Centragem por offset `-10px` (não `-translate`) p/ não colidir com a animação de entrada `plusPop` (keyframe em `index.css`; `animate-in`/`fade-in` NÃO existem — Tailwind v4 sem plugin).
- Clique no "+" (0.9.3.6+) → menu de INSERÇÃO (`plusMenu`, 2 colunas, abre p/ cima via `translate(-50%,-100%)`). `openPlusMenu` guarda âncora em `plusBlockRef` + `plusMenuOpenRef` (guarda `clearAddBtn`/`hideAddBtn`/`evalGrip`/`forcePopAbove` → "+" fica, mini-menu+pega escondem). `plusAction` insere bloco a seguir reusando `FormatBlock`/`formatter.apply`/`mceImage`/`<hr>`. Fecha em scroll (`closeMenuIfOpen`).
- Pega de arrastar (0.9.3.6+, `gripPos`/`gripBlockRef`): gutter esquerdo, centrada na borda, visível com bloco ativo (independente do rato). `startBlockDrag` distingue clique×arrasto (limiar 4px; só ao arrastar desliga `pointer-events` do iframe). Arrasto reordena o bloco de TOPO (linha `dropLine`); clique abre `gripMenu` (Duplicar/Eliminar/converter).
- Menu "/" (`addAutocompleter('slashmenu')`) e bubble de seleção (`quickbars_selection_toolbar`; `forcePopAbove` ignora quando `!isCollapsed()`).
- Placeholder: `data-mce-empty` (temp attr) no `<p>` vazio focado via `refreshEmptyMarker` (NodeChange/input) → `[data-mce-empty]::before`.
- Divisória `<hr>` (`text_patterns ---` + menus). `hr` com área de hover (`content-box` + `padding`); hover mostra controlo Pequena/Larga (`setHrWidth` alterna `.divider-full`).
- Editar HTML inline (0.9.3.6+): botão `edithtml` no mini-menu → `startHtmlEdit(top)` (bloco de TOPO). Esconde o bloco via `data-mce-htmledit` (temp attr → `visibility:hidden`), overlay React `<textarea>` na mesma caixa com `getOuterHTML` limpo (regex tira `data-mce-*`); `saveHtmlEdit`→`setOuterHTML`. `repositionHtmlEdit` segue o scroll e esconde (flag `visible`, sem desmontar) fora da vista; altura = `clamp(bloco+40, 120, 600)`.
- Mini-menu de bloco só EM CIMA: `forcePopAbove` reposiciona `.tox-pop` (observer da `.tox-tinymce-aux`); esconde (`visibility:hidden`) quando não cabe acima — TinyMCE 8 auto-flipa e não expõe knob.
- Alinhamentos: 3 botões agrupados no menu-button `blockalignmenu` (JustifyLeft/Center/Right). Borda do bloco ativo: `box-shadow: 0 0 0 3px #fff, 0 0 0 4px #dbe2ea` (folga branca + anel fino).

### DOCX / Word
- `computeFontSizes`/`scanDocxStyles` iteram com cópia local de `PARA_RE` (`exec`) — nunca `documentXml.match(PARA_RE)` (evita materializar arrays de ~15MB).
- `startsWithRaisedRun`: reconhece `<w:position>` e `<w:vertAlign superscript>` — consumido por `computeFontSizes`, `tagNoteContinuations` e `tagBodyStructure`.
- `noteSize` nunca pode ser ≥ `bodySize`.
- Junção de parágrafos partidos por página: `tagPageContinuations` + `mergePageContinuations` no docx; PDF mantém text-based.
- `consolidateSplitParagraphs` (PDF/Word): busca para trás O(n) por `lastIndexOf`.
- Mapeamento de estilos Word: `scanDocxStyles` (UI) ↔ `ExtractOptions.styleMapping` ligam-se por `styleId`; Mammoth casa por NOME do estilo.
- Estilo mapeado pelo utilizador vence heurísticas (`skipIds`); `auto` = heurística decide.
- Citação `p-quote`: `w:left ≥ baselineLeft + 200 twips` E `firstLine ≥ 150 twips`.
- `p-bold`: negrito de parágrafo inteiro via classe; disponível no editor e no mapeamento de estilos.
- Bullets Word convertidos para falas de romance (travessão).
- `mergeDropCaps`: letra isolada + parágrafo anterior começa minúscula → `span.drop-cap`.

### IDML
- `getElementsByTagName('Story')[0]` — nunca `querySelector('Story')` (apanharia o root `<idPkg:Story>`).
- `<Br/>` no IDML é quebra de PARÁGRAFO; um `<ParagraphStyleRange>` agrupa N parágrafos separados por `<Br/>`.
- Notas são `<Footnote>` inline; `<?ACE?>` (PI auto-número) é ignorado.
- Notas mistas (0.9.3.2+): `<Footnote>` com `*` + número dividida em `footnote-star-N` e `footnote-N`.
- Notas manuais (0.9.3.2+): stories `Notas`/`Notas manuais` incluídas pelo filtro case-insensitive.
- Ordem de leitura: `designmap` → Spreads → `TextFrame@ParentStory`; incluir só stories `threaded` OU com estilo estrutural.
- `Capitalization`: `SmallCaps` → `<span class="small-caps">`; `AllCaps` → uppercase antes de escapar.
- `scanCharStyles`: estilos de carácter via `AppliedCharacterStyle` (negrito/itálico/versaletes).
- Recuo de bloco: `LeftIndent` em pontos → inline `margin-left` em `<p>` plano.
- Bullets IDML: caráter literal `•`+em-space → `<ul><li>`.
- Coletâneas: `titleBlockNum` deteta títulos em stories 1-frame; `CAPITULAR` → `drop-cap`.
- Multi-IDML: `loadIdmlPackage` devolve `idmlZips[]` por ordem de nome.

### Imagens / Figuras
- Placeholder ícone cover: `onLoad` esconde irmão seguinte via `nextElementSibling`.
- Reconstrução de figuras IDML (`idml-figures.ts`): imagem↔legenda de FIGURA por SPREAD; tabela↔legenda por STORY (0.9.3.3+ — evitar atribuir a legenda de uma tabela a outra na mesma spread).
- Quadros IDML → `<table>`; legenda+fonte em `LEGENDAS`/`TXT` ou `Figura titulo` (0.9.3.3+, `CAPTION_STYLE_RE`).
- Três layouts de colocação: `insertFigures`, `placeInlineFigures`, `placeNumberedFigures`.
- `insertFigures` (0.9.3.3+): legenda já presente no corpo (estilo "Figura titulo", não dropada) é o alvo preferencial — visual DEPOIS da legenda; só recorre à referência textual "(gráfico N)" fabricando a legenda (imagem ANTES) quando a legenda foi dropada (LEGENDAS clássico).
- `placeInlineFigures` (0.9.3.3+): casa imagem↔legenda por NÚMERO (não por ordem); imagem DEPOIS da legenda.
- Índice de Figuras/Tabelas: blocos marcados `data-indice` (ver `isIndiceFigurasTabelas`/`markIndiceBlocks` em `idml-importer.ts`) e excluídos dos alvos de `insertFigures`/`placeInlineFigures`/`placeNumberedFigures`.
- Numeração decimal capítulo.figura ("2.1", "11.4"): `label.num` é string; `numPattern`/`normalizeNum` tratam zeros à esquerda e partes decimais.
- Figuras EPS: rasterizadas server-side com Ghostscript (`gs`); fallback TIFF embutido.
- Figuras PDF na `Links/` convertidas para JPEG.

### Exportação EPUB
- EPUB atómico: escreve `.tmp` + `renameSync` para evitar corrupção concorrente.
- Footnotes semânticas: `epub:type="noteref"` / `epub:type="footnote"` + `role="doc-backlink"`.
- Cores inacessíveis removidas.
- Page-list exportada quando `pageEntries.length > 0`.

### Page-list
- Folio do PDF: RODAPÉ (`y<12%`) ou CABEÇALHO (`y>88%`, fundido na linha corrente) — zona auto-detetada por livro (0.9.3.3+, `folioInZone`/`monotonicScore` em `page-list.ts`: conta pares consecutivos crescentes por zona, usa a de maior score).
- Âncora = 1ª linha após o cabeçalho corrente.
- `insertPageBreaks` alinha com busca monotónica + LIS para outliers.
- Marcador `<span class="pagebreak" data-page>` sobrevive à limpeza; export convertido para `epub:type="pagebreak"`.
- CSS do marcador é só-editor (cortado no export).

### Notas de rodapé
- `epub:type="noteref" role="doc-noteref"` / `epub:type="footnote" role="doc-footnote"`.
- Superscript das notas forçado na exportação EPUB.
- Contraste das notas no ACE corrigido.

### Diff / Comparação
- Diff LCS sobre caracteres (`[...str]`); `consolidateParts` agrupa consecutivos.
- Editor diff: só injetar spans `insert`; spans `delete` corrompem `htmlContent`.
- `clearDiffHighlights`: `span.replaceWith(textNode)` preserva edições.
- Cursor restore: block-index + char-offset via `TreeWalker`.
- Diff comparação com `.pdf` e `.doc`: PDF emite `\n` por linha.

### Auth / Segurança
- Auth multi-user: JWT + refresh tokens, Argon2id, rate limit, isolamento de dados.
- `COOKIE_SECURE`: `Bun.env.COOKIE_SECURE === 'true'`.
- Path traversal: `realpathSync` resolve symlinks antes do check de prefixo.
- `deleteUser` sempre em `db.transaction()`.
- Rate limit: 15 tentativas / 15min / IP; cap `MAX_STORE_SIZE=10_000`.

### Performance
- Consolidação de parágrafos O(n²) → O(n).
- Iteração de parágrafos em streaming (menor pico de memória).
- `post-processor` lastIndex reset para `lastParagraphIndex`/`lastFootnoteIndex`.
- Galeria: contagem de uso de imagens otimizada (1 scan + debounce).
- Lazy load do pdfjs na HomePage.
- Virtualização de listas com `react-virtuoso`.
- Grammar batching paralelo `CONCURRENCY=3`.

### UI / UX
- Modo de visualização homepage: `localStorage('epub-view-mode')` → `table | grid`.
- `UserMenu` iniciais: email split por `.`, primeiras letras dos 2 primeiros segmentos.
- Ebooks concluídos não abrem editor; invalidação de cache ao mudar estado.

### Grammar
- Cache grammar SQLite, resolução local, binary search.

### Índice
- Limpar Índice (0.8.9+): `cleanIndexText` é pura e testável; `cleanIndexSelection` trata do DOM.
- Páginas são SEMPRE descartadas; continuação de páginas = linha começada por dígito OU traço.

### Estilos
- `.p-center`: `text-align:center` + `text-indent:0`.
- `.p-quote`: recolho de 1ª linha + margens verticais (não reusar `p-top`).
- `drop-cap`: `span.drop-cap` (import automático) vs `p.drop-cap::first-letter` (manual toolbar).

