# EPUB Platform

Plataforma de edição e produção de e-books (EPUB) — importação, edição no editor rico, e exportação.

## Language

**Comment**:
Uma nota anexada a um trecho de texto de um capítulo, deixada por um utilizador durante a edição/revisão.
_Avoid_: anotação, nota

**Comment Thread**:
Um Comment raiz mais as suas Replies.
_Avoid_: conversa, discussão

**Reply**:
Um Comment que responde à raiz de um Comment Thread.

**Anchor**:
O trecho de texto a que um Comment está preso, marcado no editor com um id próprio. Só existe no editor — nunca sobrevive à exportação do EPUB.
_Avoid_: marcador (termo partilhado por outros marcadores do editor, ex. quebra de página), span

**Orphan Comment**:
Um Comment Thread cujo Anchor já não existe no texto do capítulo (o trecho foi apagado à mão no editor). O comentário sobrevive; o anchor não.
_Avoid_: dangling comment, detached comment

**Bloco ativo**:
O parágrafo ou título (p, h1–h6) onde está o cursor, com o editor focado — salvo se **recolhido**. Tem o anel à volta; é o único que mostra o botão "+" e a pega de mover. O Mini-menu aparece nele (e também em itens de lista, que não têm anel nem pega).
_Avoid_: bloco selecionado, bloco focado, parágrafo atual

**Recolhido**:
Estado de um Bloco ativo depois de um 2.º clique no mesmo bloco: esconde o anel e o Mini-menu até se clicar noutro bloco ou voltar a clicar nele.
_Avoid_: escondido, oculto

**Mini-menu**:
A barra de estilos do bloco ativo no editor (parágrafo ou título), encostada à linha da borda do bloco — em cima, ou em baixo se não houver espaço. Não é a barra de seleção de texto (aparece ao selecionar texto) nem a barra principal do editor.
_Avoid_: toolbar, popover, barra de contexto, context toolbar

**Regras da casa**:
Decisões por nome de estilo que valem para todos os livros (`estilos-base.json`, ex. `LEGENDAS` → legenda). Mudam por código (PR); o que é só de um livro escolhe-se no modal ao importar (não é guardado).
_Avoid_: estilos base, decisões globais

**Painel de edição**:
O painel lateral direito ("Edição do Bloco") que mostra e altera os atributos do que está sob o cursor: bloco de texto, caixa, imagem ou colunas. Acompanha o cursor; não é um modal.
_Avoid_: sidebar de caixa, modal de edição

**Edição de bloco**:
O module (`editor/blockEditing.ts`) que sabe o que está sob o cursor e como ler/alterar cada alvo. É o único interface que o Painel de edição usa: `inspect` → `BlockInfo`, `apply(alvo, alteração)`. Modo "Este bloco" = style inline; modo "Estilo" = regra CSS do livro (fora deste module).
_Avoid_: setProps, editor de atributos

**Importação**:
O module (`services/import/import-file.ts`) que transforma um ficheiro (PDF, Word, HTML, IDML/zip, EPUB) mais as decisões do utilizador em HTML canónico do editor. É dono da deteção de formato e da política "estruturado vs heurístico" (IDML/EPUB não levam Ficha Técnica automática nem conversões heurísticas). `extractFile` + `finalizeImport` são as duas metades de `importFile`; separadas porque criar um ebook novo tem de criar o registo antes de subir as imagens. Não inclui os pré-passos que alimentam modais (`scan*`, `analyzeBook`) nem a gravação no servidor.
_Avoid_: upload, conversão

**Notas**:
O module (`services/notes/notes.ts`) dono da convenção das notas de rodapé: modelo do editor (`<sup>N</sup>` no corpo, `<p id="footnote-N" class="footnote"><sup>N</sup> texto</p>`) ↔ EPUB semântico (`noteref`/`doc-noteref`, `aside` `doc-footnote` com backlink). `linkFootnotes` faz o sentido do export; o inverso é `reverseFootnotes` (import EPUB). Cada importador continua a ler o seu formato (Word, IDML, InDesign, PDF) e a produzir o modelo do editor.
_Avoid_: rodapés, anotações (Comment é outra coisa)

**Capítulos**:
O module (`utils/chapters.ts`) que sabe como o livro se divide em capítulos: a fronteira é o MARCADOR `<p class="chapter-break[-hN]" data-title>` antes do heading (ou `<hr class="chapter-break">` legacy). `splitChapters` (sem partes vazias, índice = `chapters[]`), `splitChapterSegments` (`join` devolve o HTML original), `matchChapterBoundary`, `classifyChapterPart`. O padrão de divisão não é exportado.
_Avoid_: secções, quebras (a quebra sem título é só um nível, `break`)

**Marcas efémeras**:
Atributos (`data-mce-ps*`, `data-mce-empty`, …) e classes do body (`ps-*`) que existem só no DOM do editor e nunca no conteúdo gravado nem exportado. `editor/ephemeral.ts` é o único dono dos nomes (`MARK`, `BODY_CLASS`) e do registo no serializer; o CSS e o JS importam daí.
_Avoid_: classes de UI, atributos temporários

**Ligação do Índice**:
Uma entrada do capítulo Índice ligada a um **Destino de ligação** (capítulo, subtítulo ou ponto livre). No editor é `span.idx-link[data-target]` (nunca `<a>`: o cleaner apaga `<a>`); só no export vira `<a href>`. `utils/indice-marker.ts` é o único dono da forma HTML (classes, ids, construtores, regex); `utils/indice-links.ts` faz as operações sobre `parts[]` (lote, ligar, desligar, listar destinos).
_Avoid_: link, hiperligação

**Destino de ligação**:
Aquilo a que uma Ligação do Índice aponta: `p.chapter-anchor` (capítulo/subtítulo) ou `span.manual-anchor[data-label]` (ponto livre, inserido no cursor pelo menu "/"). Persiste no EPUB como `id`; não confundir com **Anchor** (de Comment), que só existe no editor.
_Avoid_: âncora (já é o Anchor do Comment), marcador

**Gravação**:
O module (`pages/work/saver.ts`, sem React) dono do ciclo de vida do save de um ebook: "por gravar" (texto atual ≠ o que o servidor já tem, na forma que o save envia), autosave, retry quando a rede volta, saída do editor/separador e **Rascunho local**. O transporte (axios, keepalive), os rascunhos e o getter do texto entram como adapters; `useEbookWork` só liga isto ao React e à cache.
_Avoid_: autosave (é só um dos caminhos), persistência

**Rascunho local**:
Cópia do texto ainda não confirmada pelo servidor, no IndexedDB (`utils/local-draft.ts`). Apaga-se quando o save é confirmado; se sobrar ao abrir e diferir do servidor, oferece-se Recuperar / Ver alterações / Descartar.
_Avoid_: backup, cache

**Painéis laterais**:
O que ocupa a coluna da direita do editor: gramática, validação, galeria, PDF de impressão, comentários, painel de edição de caixa e as duas comparações (com ficheiro, entre versões/rascunho). No máximo um aberto. `hooks/useWorkPanels.ts` é o único dono dessa exclusão (`open`/`toggle`/`closeAll`/`compare*`); a página não fecha painéis à mão. Não confundir com o **Painel de edição** (um dos painéis).
_Avoid_: sidebars, modais (os modais bloqueiam a página, os painéis não)

**Edição do livro**:
O module (`pages/work/bookEdit.ts`, puro) das operações de livro inteiro: renomear/mover/eliminar/criar capítulo, nível, capitulares, Índice, links, page-list, substituir. Recebe o livro (`html`, `parts`, `chapters`) e devolve um `BookEdit` — HTML novo, o tipo de commit e o aviso — ou `null` (nada a fazer, em silêncio). Dois commits: `keep` (mantém o capítulo ativo; o editor sincroniza-se sem perder o undo) e `reset` (reorder/eliminar/criar: o índice ativo deixa de valer). `useEbookWork.applyEdit` é o único que commita.
_Avoid_: handlers de capítulo, transformações

**Menu aberto**:
Qual dos menus flutuantes do editor está aberto — inserção ("+"), pega, elemento ⋮, grelha ou "Mais estilos". No máximo um: `editor/openMenu.ts` (`createMenus`) é o único que abre/fecha, e o que se esconde enquanto está aberto (Mini-menu, botão "+", marca do bloco) deriva dele através de um adapter (`MenuHost`). O hover da divisória (`hrCtl`) e a edição de HTML não são menus abertos.
_Avoid_: popup, dropdown, overlay (o overlay é só o render)
