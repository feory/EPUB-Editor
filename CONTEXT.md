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
