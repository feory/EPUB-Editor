---
name: epub-indesign
description: Optimiza EPUBs exportados do Adobe InDesign para os ESTILOS DO EDITOR (classes p-indent, p-top, p-center, p-small, p-quote… com os valores do editor), mantendo a intenção do original (alinhamentos, recuos, espaços, negrito/itálico), com notas e quebras de página no modelo da app, pronto a importar no editor. Usar quando o utilizador pedir para optimizar/limpar/padronizar/converter um EPUB do InDesign, ou preparar um EPUB do InDesign para importar no editor.
---

# EPUB do InDesign → estilos do editor

Traduz para o **vocabulário e valores do editor** (livro igual aos da app; barra de estilos reconhece), mantendo a **intenção** do original, não os valores. Resolve: estilos com nomes diferentes por livro (`TXT`, `CharOverride-7`, `_idGen…`), `<div>` de layout, notas próprias, CSS enorme.

**Glossário** — **Map**: `mapas/<livro>.json`, o que o CSS não diz (títulos, spans, classes forçadas, `__remove__`), revisto à mão · **Intent**: o que o parágrafo quer (alinhamento, recuo, bloco, espaços, corpo, negrito/itálico, maiúsculas, filetes) · **Translation**: Intent + Map + contexto → tag + classes + alinhamento · **Front matter**: páginas antes do Índice (não criam capítulos).

## Regras de ouro

- **Dúvida → PERGUNTAR** (AskUserQuestion, amostras + recomendação) antes de converter: `h1` com muitas ocorrências (ou `h3`?), `<title>` estranhos, citação/alínea/legenda, `__remove__` (sempre).
- Resposta → mapa com `"origem": "revisto"`; regra da casa → também `estilos-base.json`.
- Nunca editar o `.epub` original (saída em `<dir>/optimizados/`). `verify` obrigatório.

## Fluxo (da raiz do projeto)

1. `bun .claude/skills/epub-indesign/optimize.ts analyze <livro.epub>` → cria/atualiza o mapa (contagem, sugestão, origem `base`/`css`/`revisto`, CSS); `revisto` nunca é sobrescrito.
2. Rever o mapa (checklist) e perguntar dúvidas.
3. `… convert <livro.epub>` → relatório "Estilo original → estilo do editor"; `⚠ classes fora do mapa` → `analyze` de novo.
4. `… verify <livro.epub>` → `0 diferenças de intenção` (alinhamento, recuo, espaço acima/abaixo, negrito, itálico, maiúsculas), `texto ✓`, imagens/quebras/notas `✓`, `classes: só do editor ✓`.
5. Importar na HomePage e confirmar a Estrutura. Decisões recorrentes → `estilos-base.json`.
6. Mudou `translate.ts`/`commands.ts` → testes + reconverter; `verify` limpo.

## Ficheiros

| Ficheiro | Papel |
|---|---|
| `optimize.ts` | Só CLI: lê/escreve (EPUB, mapa, `estilos-base.json`, `DEFAULT_CSS`), imprime |
| `commands.ts` | `analyzeBook(bytes, {baseStyles, previousMap})`, `convertBook(bytes, map, editorCss)`, `verifyBook(orig, opt)` — sem disco/consola; estrutura do DOM, títulos, pacote de saída |
| `book.ts` | `openBook(bytes)` abre 1×: OPF, cascata do CSS original (`resolve`), documentos, `css`, `bodySize`, `referencedIds`, `frontMatter` (calculados antes do convert mexer) |
| `translate.ts` | `intentOf`, `translateParagraph`, `translateSpan`, `preservedOf` — **toda a regra e limiares**; convert aplica, verify compara |
| `titles.ts` | `indesignTitle` (Ficha Técnica, Rosto); usa `chapterTitleOf` da app |
| `editor.ts` | `editorVocabulary(css)` = classes do CSS do editor (convert valida classes forçadas; verify lê o `style.css` do optimizado) — sem listas à mão |
| `estilos-base.json` | Decisões da casa por `tag.classe` (sem maiúsculas), antes da heurística |
| `tests/` | `bun test ./.claude/skills/epub-indesign/tests/` (o `./` é preciso: bun ignora pastas com ponto). `translate` (regras), `editor` (inclui `DEFAULT_CSS` real), `titles`, `commands` (livro inteiro com `makeEpub` em memória). Caso novo = teste novo |

CSS de saída = `DEFAULT_CSS` (`src/context/StyleContext.tsx`, sem editor-only nem `@font-face`).

## Tradução automática (CSS resolvido: estilo + overrides + `#id`, shorthands expandidos)

| Original | Editor |
|---|---|
| centrado / direita·esquerda / justificado | `p-center` / `style="text-align:…"` / nada |
| recuo 1.ª linha | `p-indent` |
| recuo pendente, margem ≥ 1.5em / mais curto (bibliografia) | `alinea` / normal |
| margem esquerda ≥ 1em | `p-quote` (+ `p-indent` se recuo 1.ª linha) |
| acima ≥ 0.5em / ≥ 2.5em · abaixo ≥ 0.5em | `p-top` / `p-space` · `p-bottom` |
| parágrafo/título vazio | sai; `p-top` no seguinte |
| corpo < 95% do texto corrente (`<p>` com mais texto) | `p-small` |
| negrito / itálico / ambos · maiúsculas · filetes | `p-bold` / `p-italic` / `p-bold-italic` · `p-uppercase` · `p-border-top/bottom` |

Exceções: notas e tabelas sem classes; `p-legendas` tira `p-small`/`p-bottom`/`p-indent`; títulos só alinhamento.

## Mapa

`{ "classes": { "p.X": { "target", "origem", "count", "sample", "css" } } }`

- **`p.X`**: `h1` capítulo (`<h1>` seguidos → `A<br/>B`) · `h2` sub-capítulo (só se o TOC tiver) · `h3` subtítulo · classes do editor (ex. `p-legendas`) substituem só a forma (alinea/quote/small/legendas) · `""` automático · título sem letras/números (`*`) → `p-asterisk`.
- **`span.X`**: `i b u sup sub small-caps drop-cap` (combináveis), só com efeito real no CSS ("Superscript" sem elevação ≠ `<sup>`); resto desembrulhado.
- **`__remove__`**: apaga elemento **e conteúdo**; só lixo comprovado, confirmado.
- **Sugestões**: corpo ≥ 1.6× → `h1`; ≥ 1.1× ou nome título/subt/sub → `h3`; "legenda" → `p-legendas`; spans pelo CSS.
- **Checklist**: `h1` só para títulos do TOC original (números de aforismos, rosto, autor, "FIM" → `""`/`h3`; centenas de `h1` = erro) · subtítulos `h3` · legendas `p-legendas` · citações `p-quote` · rever o relatório do convert.
- **Decididos** (reaplicar se o mapa se perder): `9789724429861` `SUBT-TULOS-CENTRADOS` = `h3` · `9789724429557` `ABERTURA` = `h3` (cada poema continua capítulo pelo `<title>` do ficheiro) · `9789899336186` `CAD-AUT_TIT` = `h1`, `Tit2` = `""` · `9789724429823` `Autor_inicio` = `""`, `Titulo-Tabela` = `p-legendas` · `Rosto-*`, `nome-do-autor`, `nome-autor`, `FIM` = parágrafo · `Recolhido*` = `p-quote` · `LEGENDAS*` = `p-legendas` · `Capitular` = `drop-cap`.

## Títulos dos capítulos

- Só do `<title>` de cada ficheiro, nunca do nav (no InDesign traz o page-list → "1", "161"…).
- Vazio, sem letras/números ou = nome do ficheiro → sem título (junta ao anterior). Regra única: `chapterTitleOf` (`src/utils/chapter-title.ts`), usada pelo importador e pelo skill.
- Chamadas de nota fora do nome ("SOMBRA(143)" → "SOMBRA").
- Convert: parágrafo-rótulo de ficha técnica (começa por autor/autora/autores, revisão, capa, design da capa, ISBN; < 120 car.) → `Ficha Técnica` em qualquer página (as mesmas palavras a meio de um capítulo não contam) · ficha técnica (©/ISBN/"Título original") com título falso ou antes do Índice → `Ficha Técnica` · rótulo da ficha ("Título:", "Título original:") noutra página → `Rosto` · antes do Índice (se houver Índice) com títulos/imagem → `Rosto`, títulos viram parágrafos · texto simples e dedicatórias mantêm o `<title>`.
- Resultado típico: **Capa · Rosto · Ficha Técnica · Índice · capítulos**.

## Estrutura e limpeza (fixas)

- **Notas**: `a._idFootnoteLink` → `sup > a[noteref]` (nº sempre em `<sup>`); `section._idFootnotes` → `div.footnotes-section > aside.footnote` (o importador desembrulha e junta parágrafos com `<br>`).
- **Quebras de página**: mantêm `id`/`aria-label`; `<div>` → `<span>` vazio no parágrafo seguinte; conteúdo lá dentro (nº da nota) sai para a linha da nota.
- **Sai**: CSS/fontes do InDesign, `style=""`, classes de tabelas/imagens/listas/links, `<div>` contentores (id referenciado passa para o 1.º filho), âncoras `_idTextAnchor` vazias não referenciadas, hífenes discricionários (`U+00AD`, `&#173;`, `&shy;`), `nav` do spine.
- **Fica**: nomes dos ficheiros, imagens, capa, OPF/metadados, `toc.ncx`, `nav` (com page-list).

## Diferenças intencionais no verify

Separadores `*` → `p-asterisk` (itálico) · nº da nota dentro da quebra → linha da nota ("sem par") · valores do editor (recuo 2.15em, espaço 30px, `p-small` 0.85em) ≠ original.

## Dependências na app

`src/utils/chapter-title.ts` (`chapterTitleOf`) · `src/services/epub-importer.ts` (títulos do `<title>`, notas com vários parágrafos inteiras, espaço no `<sup>` da nota) · `src/utils/html-cleaner.ts` (`flattenHeadingText` sem chamadas de nota).
