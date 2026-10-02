---
name: epub-indesign
description: Optimiza EPUBs exportados do Adobe InDesign para os ESTILOS DO EDITOR (classes p-indent, p-top, p-center, p-small, p-quote… com os valores do editor), mantendo a intenção do original (alinhamentos, recuos, espaços, negrito/itálico), com notas e quebras de página no modelo da app, pronto a importar no editor. Usar quando o utilizador pedir para optimizar/limpar/padronizar/converter um EPUB do InDesign, ou preparar um EPUB do InDesign para importar no editor.
---

# Optimizar EPUB do InDesign → estilos do editor

## 1. Objetivo

- Traduzir o EPUB do InDesign para o **vocabulário e os valores do editor** → livro igual aos outros
  da app; a barra de estilos reconhece cada estilo.
- Manter a **intenção** do original (alinhamento, recuo, espaço, negrito/itálico, maiúsculas), não os
  valores exatos.
- Problemas do InDesign que resolve: nomes de estilo diferentes por livro (`TXT`, `TEXTO`,
  `CharOverride-7`, `_idGenParaOverride-1`…), `<div>` de layout, notas em formato próprio, CSS enorme.

## Glossário

- **Map** (mapa do livro): `mapas/<livro>.json` — o que o CSS não diz (títulos, semântica dos spans,
  classes forçadas, `__remove__`); revisto à mão.
- **Intent** (intenção de parágrafo): o que o original quer — alinhamento, tipo de recuo, bloco
  recolhido, espaço acima/abaixo, corpo pequeno, negrito/itálico, maiúsculas, filetes. `intentOf()`.
- **Translation** (tradução): Intent + Map + contexto → tag, classes do editor e alinhamento.
  `translateParagraph()` / `translateSpan()`.
- **Front matter**: páginas antes do Índice (rosto, ficha técnica) — não criam capítulos.

## 2. Regras de ouro

- **Em caso de dúvida, PERGUNTAR** ao utilizador (AskUserQuestion, com amostras e sugestão
  recomendada) ANTES de converter. Nunca decidir sozinho. Dúvidas típicas:
  - estilo com muitas ocorrências sugerido como `h1` (capítulos ou subtítulos `h3`?);
  - títulos de capítulo estranhos no `<title>`;
  - estilo que pode ser citação, alínea ou legenda;
  - `__remove__` (apaga conteúdo) — confirmar sempre.
- Respostas → mapa do livro com `"origem": "revisto"`; se for regra da casa → também `estilos-base.json`.
- Nunca editar o `.epub` original; o resultado vai sempre para `<dir>/optimizados/`.
- `verify` é obrigatório antes de dar um livro por concluído.

## 3. Ficheiros

- `optimize.ts` — **só a CLI** (`analyze` | `convert` | `verify`), correr da raiz do projeto: lê/escreve
  ficheiros (EPUB, mapa, `estilos-base.json`, `DEFAULT_CSS` da app) e imprime os relatórios.
- `commands.ts` — os três comandos sem disco nem consola: `analyzeBook(bytes, { baseStyles, previousMap })`,
  `convertBook(bytes, map, editorCss)`, `verifyBook(originalBytes, optimizedBytes)`. Aqui vive a
  estrutura do DOM (notas, quebras, contentores, `<h1>` fundidos), os títulos dos capítulos e o pacote de saída.
- `book.ts` — livro InDesign aberto **uma vez**: `openBook(bytes)` → pacote (OPF, manifest), cascata do
  CSS original (`resolve`), documentos do spine parseados, e os factos partilhados pelos três comandos:
  `bodySize` (corpo do texto corrente), `referencedIds` (âncoras a manter), `frontMatter` (páginas
  antes do Índice). Factos calculados ao abrir, antes de o `convert` alterar os documentos.
- `editor.ts` — vocabulário do editor: `editorVocabulary(css)` = classes definidas no CSS do editor.
  O `convert` usa-o (a partir do `DEFAULT_CSS`) para validar as classes forçadas no mapa; o `verify` lê-o
  do `style.css` do próprio EPUB optimizado. Sem listas de classes à mão — classe nova no editor vale logo.
- `titles.ts` — política de títulos do InDesign (`indesignTitle`: Ficha Técnica, Rosto); usa a regra
  genérica da app `chapterTitleOf` (`src/utils/chapter-title.ts`) para "isto não é um título".
- `translate.ts` — module da Translation, sem I/O nem DOM: `intentOf`, `translateParagraph`,
  `translateSpan`, `preservedOf` (campos que o `verify` compara). **Toda a regra de tradução e todos
  os limiares vivem aqui** — o `convert` aplica e o `verify` compara com o mesmo module.
- Testes — `bun test ./.claude/skills/epub-indesign/` (com `./`: o bun ignora pastas com ponto num filtro):
  - `translate.test.ts` — regras de tradução (caso novo de tradução = teste novo aqui);
  - `editor.test.ts` — vocabulário (inclui confirmar que o `DEFAULT_CSS` real tem as classes que a tradução emite);
  - `titles.test.ts` — política de títulos (Ficha Técnica, Rosto, dedicatórias, sem título);
  - `commands.test.ts` — livro inteiro: EPUBs mínimos "à InDesign" feitos em memória (`makeEpub`) →
    `convertBook`/`verifyBook` (notas, quebras, Rosto/Ficha Técnica, `<h1>` fundidos, contentores,
    `verify` a apanhar texto perdido). Caso novo de estrutura = teste novo aqui.
- `estilos-base.json` — decisões da casa por nome de estilo (`tag.classe`, sem distinção de
  maiúsculas), aplicadas a todos os livros antes da heurística.
- `<dir>/mapas/<livro>.json` — mapa do livro (gerado pelo `analyze`, revisto à mão).
- `<dir>/optimizados/<livro>.epub` — resultado.
- CSS do resultado = `DEFAULT_CSS` de `src/context/StyleContext.tsx` (sem secção editor-only nem
  `@font-face`), o mesmo que a app exporta, + `extras` do mapa (raro).

## 4. Fluxo

1. **Analisar**: `bun .claude/skills/epub-indesign/optimize.ts analyze <livro.epub>`
   - Cria/atualiza o mapa; imprime contagem, sugestão, origem (`base`/`css`/`revisto`) e CSS de cada estilo.
   - Entradas `revisto` nunca são sobrescritas.
2. **Rever o mapa** (secção 6) e **perguntar** as dúvidas.
3. **Converter**: `… convert <livro.epub>`
   - Imprime o relatório **"Estilo original → estilo do editor"** (ex. `p.TXT_esp → p.p-indent.p-top`).
   - `⚠ classes fora do mapa` → correr `analyze` de novo.
4. **Verificar**: `… verify <livro.epub>` — tem de dar:
   - `0 diferenças de intenção` (alinhamento, recuo, espaço acima/abaixo, negrito, itálico, maiúsculas);
   - `texto ✓`, imagens `✓`, quebras de página `✓`, notas `✓`;
   - `classes: só do editor ✓`.
5. **Importar** na HomePage do editor e confirmar a Estrutura (capítulos).
6. Decisões recorrentes → `estilos-base.json`.
7. Ao mudar `translate.ts` ou `commands.ts`: correr os testes e reconverter os livros; o `verify` tem de continuar limpo.

## 5. Tradução automática dos parágrafos (`translate.ts`)

A partir do CSS original resolvido (estilo + overrides + `#id`; shorthands como `margin` expandidos).

- **Alinhamento**
  - centrado → `p-center`
  - direita / esquerda → `style="text-align: right|left"` (como os botões de alinhamento do editor)
  - justificado → nada (padrão)
- **Recuos**
  - recuo de 1.ª linha → `p-indent`
  - recuo pendente com margem ≥ 1.5em (alíneas, listas) → `alinea`; mais curto (ex. bibliografia) → normal
  - bloco recolhido (margem esquerda ≥ 1em) → `p-quote` (+ `p-indent` se tiver recuo de 1.ª linha)
- **Espaços**
  - acima ≥ 0.5em → `p-top`; ≥ 2.5em → `p-space`
  - abaixo ≥ 0.5em → `p-bottom`
  - parágrafo/título vazio (espaço à mão) → sai; `p-top` no parágrafo seguinte
- **Tipografia**
  - corpo < 95% do texto corrente (corpo do `<p>` com mais texto no livro) → `p-small`
  - negrito / itálico / ambos → `p-bold` / `p-italic` / `p-bold-italic`
  - maiúsculas → `p-uppercase`
  - filete em cima / em baixo → `p-border-top` / `p-border-bottom`
- **Exceções**
  - parágrafos em notas e tabelas → sem classes (estilo do editor)
  - `p-legendas` tira `p-small`, `p-bottom` e `p-indent` (já os inclui)
  - títulos (`h1`–`h3`) → só alinhamento (`p-center` / direita)

## 6. O mapa do livro (o que o CSS não diz)

- **Formato**: `{ "extras": "", "classes": { "p.X": { "target", "origem", "count", "sample", "css" } } }`
- **`p.X` → `target`**
  - `h1` — capítulo. `<h1>` seguidos fundem-se num só (`A<br/>B`).
  - `h2` — sub-capítulo (nível 2 no índice do editor); só se o livro tiver essa hierarquia.
  - `h3` — subtítulo dentro do capítulo (não cria capítulo).
  - classes do editor (ex. `p-legendas`, `p-quote`) — substituem só a "forma" automática
    (alinea/quote/small/legendas); espaços, alinhamento e peso continuam automáticos.
  - `""` — automático.
  - "título" sem letras nem números (ex. `*`, `***`) → `p-asterisk` (separador do editor), nunca capítulo.
- **`span.X` → `target`**
  - `i` `b` `u` `sup` `sub` `small-caps` `drop-cap` (combináveis, ex. `b i`).
  - Só aplicado se o efeito existir no CSS original (estilo "Superscript" sem elevação ≠ `<sup>`).
  - Restantes spans desembrulhados.
- **`__remove__`** — apaga o elemento **e o conteúdo**; só lixo comprovado, sempre confirmado.
- **Sugestões automáticas** (`analyze`)
  - corpo ≥ 1.6× o texto → `h1`; ≥ 1.1× ou nome tipo "título/subt/sub" → `h3`;
  - nome com "legenda" → `p-legendas`;
  - spans pelo CSS (negrito, itálico, sublinhado, elevação, versaletes).

### Checklist de revisão

- **Capítulos**: `h1` só para os títulos que abrem capítulo (os do TOC original).
  - Números grandes (aforismos "408"), rosto, nome do autor, "FIM" → `""` ou `h3`.
  - Centenas de `h1` = quase sempre erro.
- **Subtítulos** → `h3`; **legendas** → `p-legendas`; **citações** com estilo próprio → `p-quote`.
- Rever o relatório "Estilo original → estilo do editor" do `convert`.

### Decisões já tomadas pelo utilizador

- `9789724429861`: `SUBT-TULOS-CENTRADOS` (títulos/números de aforismos, 776×) = `h3`.
- Estilos de rosto (`Rosto-*`, `nome-do-autor`, `nome-autor`) e `FIM` = parágrafo (em `estilos-base.json`).
- `Recolhido*`/`RECOLHIDOS` = `p-quote`; `LEGENDAS*` = `p-legendas`; `Capitular` = `drop-cap`.

## 7. Títulos dos capítulos (`<title>`)

- No editor, o nome de cada capítulo vem **só do `<title>`** do ficheiro — nunca do nav/page-list
  (no InDesign o nav traz a lista de páginas → capítulos "1", "161"…).
- `<title>` vazio, sem letras/números, ou igual ao nome do ficheiro (o InDesign põe-no quando não há
  título) → sem título; o ficheiro junta-se ao capítulo anterior. Regra única da app:
  `chapterTitleOf` em `src/utils/chapter-title.ts` (importador e skill usam a mesma).
- Chamadas de nota não entram no nome ("SOMBRA(143)" → "SOMBRA").
- Correções feitas pelo `convert`:
  - conteúdo de ficha técnica (©, ISBN, "Título original") com título falso, ou antes do Índice
    → `Ficha Técnica`;
  - rótulo copiado da ficha ("Título:", "Título original:") noutra página → `Rosto`;
  - antes do Índice (só se o livro tiver Índice): página com títulos ou imagem → `Rosto`, e os
    títulos lá dentro passam a parágrafos (não criam capítulos);
  - texto simples antes do Índice e dedicatórias → mantêm o `<title>` (ex. "Para o Daniel, com amor").
- Resultado típico: **Capa · Rosto · Ficha Técnica · Índice · capítulos**.

## 8. Estrutura e limpeza (fixas, sem mapa)

- **Notas**
  - `a._idFootnoteLink` → `sup > a[epub:type=noteref]`; o nº fica sempre dentro de `<sup>`.
  - `section._idFootnotes` → `div.footnotes-section > aside.footnote` (com os parágrafos da nota).
  - O importador desembrulha o `div` e junta notas de vários parágrafos com `<br>`.
- **Quebras de página**
  - Mantêm `id`/`aria-label`; `<div>` → `<span>` vazio, dentro do parágrafo seguinte.
  - Conteúdo que o InDesign meteu dentro da quebra (ex. nº da nota) sai para a linha da nota.
- **Removido**
  - CSS e fontes do InDesign; `style=""`; classes de tabelas, imagens, listas e links.
  - Contentores `<div>` (`_idContainer`…); se o `id` for referenciado, passa para o 1.º elemento de dentro.
  - Âncoras `_idTextAnchor` vazias não referenciadas.
  - Hífenes discricionários (`U+00AD`, `&#173;`, `&shy;`).
  - `nav` do spine (o EPUB3 não exige; o editor não o importa como capítulo).
- **Mantido**: nomes dos ficheiros, imagens, capa, OPF/metadados, `toc.ncx`, `nav` (com page-list).

## 9. Diferenças intencionais (o `verify` pode mostrar)

- Separadores (`*`) em `p-asterisk` → itálico do editor.
- Nº da nota que o InDesign meteu dentro da quebra de página → passa para a linha da nota ("sem par").
- Valores do editor (recuo 2.15em, espaço 30px, `p-small` 0.85em…) ≠ medidas do original — esperado.

## 10. Dependências na app (já feitas)

- `src/utils/chapter-title.ts` (`chapterTitleOf`): o que é e não é um título de capítulo — usado pelo
  importador e pelo `titles.ts` do skill.
- `src/services/epub-importer.ts`: títulos dos capítulos a partir do `<title>` (via `chapterTitleOf`); notas com vários
  parágrafos inteiras; espaço dentro do `<sup>` da nota preservado.
- `src/utils/html-cleaner.ts` (`flattenHeadingText`): chamadas de nota fora do nome do capítulo.
