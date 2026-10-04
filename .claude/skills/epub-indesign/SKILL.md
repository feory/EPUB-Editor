---
name: epub-indesign
description: Optimiza EPUBs exportados do Adobe InDesign para os ESTILOS DO EDITOR (classes p-indent, p-top, p-center, p-small, p-quote… com os valores do editor), mantendo a intenção do original (alinhamentos, recuos, espaços, negrito/itálico), com notas e quebras de página no modelo da app, pronto a importar no editor. Usar quando o utilizador pedir para optimizar/limpar/padronizar/converter um EPUB do InDesign, ou preparar um EPUB do InDesign para importar no editor.
---

# EPUB do InDesign → estilos do editor

## Objetivo
- Classes e valores **do editor** (livro igual aos da app; a barra de estilos reconhece).
- Manter a **intenção** do original, não os valores.
- Resolve: nomes de estilo por livro (`TXT`, `CharOverride-7`, `_idGen…`), `<div>` de layout, notas próprias, CSS enorme.

## Glossário
- **Map**: o que o CSS não diz (títulos, spans, classes forçadas, `__remove__`). Sugestão = regras da casa + heurística; revista no modal; não é guardada (cada livro importa-se uma vez).
- **Intent**: o que o parágrafo quer — alinhamento, recuo, bloco, espaços, corpo, negrito/itálico, maiúsculas, filetes.
- **Translation**: Intent + Map + contexto → tag + classes + alinhamento.
- **Front matter**: páginas antes do Índice (não criam capítulos).

## Regras de ouro
- **Dúvida → PERGUNTAR** (AskUserQuestion, amostras + recomendação) antes de converter:
  - `h1` com muitas ocorrências (ou `h3`?);
  - `<title>` estranhos;
  - citação / alínea / legenda;
  - `__remove__` — sempre;
  - `<br/>` do paginador — sempre, com o total, a contagem de cada tipo e 1 exemplo de cada.
- Resposta só deste livro → modal da app, ao importar.
- Regra para todos os livros → `estilos-base.json`.
- Nunca editar o `.epub` original; saída em `<dir>/optimizados/`.
- Verificação obrigatória (`convert` com `verificação ✓`).

## Fluxo (da raiz do projeto)
1. `bun .claude/skills/epub-indesign/optimize.ts analyze <livro.epub>`
   - mostra o mapa sugerido (contagem, alvo, origem `base`/`css`, CSS) e os `<br/>` por tipo;
   - não grava nada.
2. Rever o mapa (checklist) e perguntar as dúvidas.
3. `… convert <livro.epub> [--juntar-br]`
   - converte e **verifica** (`optimizeBook`);
   - `--juntar-br` só depois de o utilizador aceitar;
   - relatório "Estilo original → estilo do editor" + diferenças de intenção;
   - `✗` problemas: texto/imagens/quebras/notas perdidos (na app bloqueiam, salvo Importação forçada);
   - `⚠` avisos: intenção, classes fora do editor.
4. Corrigir (`estilos-base.json` ou código) e repetir até não haver `✗`.
5. Importar na HomePage e confirmar a Estrutura.
6. Mudou `src/services/indesign/` → `bun test src/services/indesign` + reconverter (vale para app e CLI).

## Onde está o código
- Vive na app: `src/services/indesign/` — o mesmo da **Importação InDesign** (menu do utilizador, debaixo de "Importação EPUB 2.0").
- Na app: analisa → modal (dúvidas em destaque, `<br/>`) → optimiza → verifica → importa.
- Os `.ts` desta pasta só reexportam; `estilos-base.json` é um link para o da app.

| Ficheiro | Papel |
|---|---|
| `commands.ts` | `analyzeBook(bytes, {baseStyles})` → `map`, `lineBreaks`, `alreadyOptimized` · `optimizeBook(bytes, map, editorCss, {joinLineBreaks})` = convert + verify + política (`problems` bloqueiam, `warnings` avisam) |
| `book.ts` | `openBook(bytes)`: OPF, cascata do CSS (`resolve`), documentos, `bodySize`, `referencedIds`, `frontMatter`; DOM nativo (bun: `happy-dom.ts`) |
| `translate.ts` | `intentOf`, `translateParagraph`, `translateSpan`, `preservedOf` — toda a regra e limiares |
| `titles.ts` | `indesignTitle` (Ficha Técnica, Rosto); usa `chapterTitleOf` |
| `editor.ts` | `editorVocabulary(css)`, `editorExportCss(DEFAULT_CSS)` (CSS de saída, sem editor-only nem `@font-face`) |
| `estilos-base.json` | Regras da casa por `tag.classe` (sem maiúsculas), antes da heurística |
| `tests/` | `bun test src/services/indesign`; caso novo = teste novo |
| `optimize.ts` (aqui) | Só CLI: lê o EPUB, escreve `optimizados/`, imprime |

## EPUB já optimizado
- Deteção: CSS = o do editor e todas as classes do texto existem nele.
- `analyze` avisa; `convert` devolve-o tal e qual (optimizar de novo perdia `h1`/`h3`).
- Na app entra direto, sem modal.

## Tradução automática
CSS resolvido (estilo + overrides + `#id`, shorthands expandidos):

| Original | Editor |
|---|---|
| centrado / direita·esquerda / justificado | `p-center` / `style="text-align:…"` / nada |
| recuo 1.ª linha | `p-indent` |
| recuo pendente, margem ≥ 1.5em / mais curto | `alinea` / normal |
| margem esquerda ≥ 1em | `p-quote` (+ `p-indent` se recuo) |
| acima ≥ 0.5em / ≥ 2.5em · abaixo ≥ 0.5em | `p-top` / `p-space` · `p-bottom` |
| parágrafo/título vazio | sai; `p-top` no seguinte |
| corpo < 95% do texto corrente | `p-small` |
| negrito / itálico / ambos | `p-bold` / `p-italic` / `p-bold-italic` |
| maiúsculas · filetes | `p-uppercase` · `p-border-top/bottom` |

- Exceções: notas e tabelas sem classes; `p-legendas` tira `p-small`/`p-bottom`/`p-indent`; títulos só alinhamento.

## Mapa
- Formato: `{ "classes": { "p.X": { "target", "origem", "count", "sample", "css" } } }`.
- `p.X`:
  - `h1` capítulo (`<h1>` seguidos → `A<br/>B`);
  - `h2` sub-capítulo (só se o TOC tiver);
  - `h3` subtítulo;
  - classe do editor (ex. `p-legendas`, `p-bold`) — alinea/quote/small/legendas substituem só a forma;
  - `""` automático;
  - título sem letras/números (`*`) → `p-asterisk`.
- `span.X`: `i b u sup sub small-caps drop-cap` (combináveis), só com efeito real no CSS; resto desembrulhado.
- `__remove__`: apaga elemento **e** conteúdo; só lixo comprovado e confirmado.
- Sugestões: corpo ≥ 1.6× → `h1`; ≥ 1.1× ou nome título/subt/sub → `h3`; "legenda" → `p-legendas`; spans pelo CSS.
- Checklist:
  - `h1` só para títulos do TOC original (aforismos, rosto, autor, "FIM" → `""`/`h3`; centenas de `h1` = erro);
  - subtítulos `h3`, legendas `p-legendas`, citações `p-quote`;
  - rever o relatório do convert.

## Títulos dos capítulos
- Só do `<title>` de cada ficheiro, nunca do nav (no InDesign é o page-list: "1", "161"…).
- Sem título (junta ao anterior): vazio, sem letras/números ou = nome do ficheiro — regra única `chapterTitleOf`.
- Chamadas de nota saem do nome ("SOMBRA(143)" → "SOMBRA").
- `<title>` repetido em vários ficheiros → só o 1.º cria capítulo.
- `Ficha Técnica`:
  - parágrafo-rótulo (autor/autora/autores, revisão, capa, design da capa, ISBN; < 120 car.) em qualquer página;
  - ficha (©/ISBN/"Título original") com título falso ou antes do Índice.
- `Rosto`:
  - rótulo "Título"/"Título original" (com ou sem ":") noutra página ("Sun Tzu disse:" é título real);
  - antes do Índice com títulos/imagem (títulos viram parágrafos).
- Texto simples e dedicatórias mantêm o `<title>`.
- Resultado típico: **Capa · Rosto · Ficha Técnica · Índice · capítulos**.

## Estrutura e limpeza
- **Notas**: `a._idFootnoteLink` → `sup > a[noteref]`; `section._idFootnotes` → `div.footnotes-section > aside.footnote`.
- **Quebras de página**: mantêm `id`/`aria-label`; `<div>` → `<span>` vazio no parágrafo seguinte; nº da nota lá dentro sai para a linha da nota.
- **`<br/>` do paginador** (parágrafos e notas; títulos nunca), só com o "sim" do utilizador:
  - a meio da frase / depois do fim da frase → espaço;
  - hífen ou barra repetidos (`não-⏎-instr.`, `a/⏎/b`) → um;
  - hífen no fim da linha → junta, mantém o hífen;
  - no início/fim do parágrafo → sai;
  - na app: caixa no modal, desligada por omissão.
- **Sai**: CSS/fontes do InDesign, `style=""`, classes de tabelas/imagens/listas/links, `<div>` contentores (id referenciado passa ao 1.º filho), âncoras `_idTextAnchor` vazias não referenciadas, hífenes discricionários (`U+00AD`), `nav` do spine.
- **Fica**: nomes dos ficheiros, imagens, capa, OPF/metadados, `toc.ncx`, `nav` (com page-list).

## Verificação — diferenças esperadas
- Separadores `*` → `p-asterisk` (itálico).
- Nº da nota dentro da quebra → linha da nota ("sem par").
- Valores do editor (recuo 2.15em, espaço 30px, `p-small` 0.85em) ≠ original.
- Texto comparado sem espaços e com `--`/`//` = `-`/`/` (junção dos `<br/>`).

## Dependências na app
- `src/utils/chapter-title.ts` — `chapterTitleOf`.
- `src/services/import/epub-importer.ts` — títulos do `<title>`, notas com vários parágrafos, espaço no `<sup>` da nota.
- `src/utils/html-cleaner.ts` — `flattenHeadingText` sem chamadas de nota.
