---
name: epub-indesign
description: Optimiza EPUBs exportados do Adobe InDesign para os ESTILOS DO EDITOR (classes p-indent, p-top, p-center, p-small, p-quote… com os valores do editor), mantendo a intenção do original (alinhamentos, recuos, espaços, negrito/itálico), com notas e quebras de página no modelo da app, pronto a importar no editor. Usar quando o utilizador pedir para optimizar/limpar/padronizar/converter um EPUB do InDesign, ou preparar um EPUB do InDesign para importar no editor.
---

# EPUB do InDesign → estilos do editor

Traduz para o **vocabulário e valores do editor** (livro igual aos da app; barra de estilos reconhece), mantendo a **intenção** do original, não os valores. Resolve: estilos com nomes diferentes por livro (`TXT`, `CharOverride-7`, `_idGen…`), `<div>` de layout, notas próprias, CSS enorme.

**Glossário** — **Map**: o que o CSS não diz (títulos, spans, classes forçadas, `__remove__`) = sugestão (regras da casa + heurística), revista no modal da Importação InDesign (não é guardada: cada livro importa-se uma vez) · **Intent**: o que o parágrafo quer (alinhamento, recuo, bloco, espaços, corpo, negrito/itálico, maiúsculas, filetes) · **Translation**: Intent + Map + contexto → tag + classes + alinhamento · **Front matter**: páginas antes do Índice (não criam capítulos).

## Regras de ouro

- **Dúvida → PERGUNTAR** (AskUserQuestion, amostras + recomendação) antes de converter: `h1` com muitas ocorrências (ou `h3`?), `<title>` estranhos, citação/alínea/legenda, `__remove__` (sempre), `<br/>` do paginador (sempre: quantos casos + 1 exemplo de cada tipo).
- Resposta só deste livro → escolher no modal da app ao importar; regra que vale para todos os livros → `estilos-base.json`.
- Nunca editar o `.epub` original (saída em `<dir>/optimizados/`). `verify` obrigatório.

## Fluxo (da raiz do projeto)

1. `bun .claude/skills/epub-indesign/optimize.ts analyze <livro.epub>` → mostra o mapa sugerido (contagem, alvo, origem `base`/`css`, CSS). Não grava nada.
2. Rever o mapa (checklist) e perguntar dúvidas; as respostas escolhem-se no modal ao importar (ou viram regra da casa).
3. `… convert <livro.epub>` → converte com o mapa sugerido e **verifica** (`optimizeBook`): relatório "Estilo original → estilo do editor", diferenças de intenção, `✗` problemas (texto/imagens/quebras/notas perdidos — na app bloqueiam, salvo Importação forçada) e `⚠` avisos (intenção, classes fora do editor). Objetivo: `verificação ✓`.
4. Corrigir (`estilos-base.json` ou código) e repetir até não haver `✗`.
5. Importar na HomePage e confirmar a Estrutura. Decisões recorrentes → `estilos-base.json`.
6. Mudou algo em `src/services/indesign/` → `bun test src/services/indesign` + reconverter; `convert` com `verificação ✓` (vale para a app e para a CLI).

## Ficheiros

O código vive na **app** (`src/services/indesign/`) e é o mesmo da **Importação InDesign** (página inicial → menu do utilizador, debaixo de "Importação EPUB 2.0": analisa → modal com dúvidas em destaque → optimiza → verifica, e bloqueia se perder texto/imagens/notas/quebras → importa). Os `.ts` desta pasta só o reexportam (sempre sincronizados) e `estilos-base.json` é um link para o da app.

| Ficheiro (`src/services/indesign/`) | Papel |
|---|---|
| `commands.ts` | `analyzeBook(bytes, {baseStyles})`, `optimizeBook(bytes, map, editorCss)` (convert + verify + **política**: `problems` bloqueiam, `warnings` avisam — igual na app e na CLI; usa `convertBook`/`verifyBook`) — sem disco/consola; estrutura do DOM, títulos, pacote de saída |
| `book.ts` | `openBook(bytes)` abre 1×: OPF, cascata do CSS original (`resolve`), documentos, `css`, `bodySize`, `referencedIds`, `frontMatter`. DOM = `DOMParser`/`XMLSerializer` globais (browser; no bun via `happy-dom.ts`) |
| `translate.ts` | `intentOf`, `translateParagraph`, `translateSpan`, `preservedOf` — **toda a regra e limiares**; convert aplica, verify compara |
| `titles.ts` | `indesignTitle` (Ficha Técnica, Rosto); usa `chapterTitleOf` (`src/utils/chapter-title.ts`) |
| `editor.ts` | `editorVocabulary(css)` (classes do editor, sem listas à mão), `editorExportCss(DEFAULT_CSS)` (CSS de saída) |
| `estilos-base.json` | Decisões da casa por `tag.classe` (sem maiúsculas), antes da heurística |
| `tests/` | `bun test src/services/indesign` — `translate`, `editor` (inclui `DEFAULT_CSS` real), `titles`, `commands` (livro inteiro com `makeEpub` em memória). Caso novo = teste novo |
| `.claude/skills/epub-indesign/optimize.ts` | Só CLI: lê o EPUB, escreve `optimizados/`, imprime |

CSS de saída = `editorExportCss(DEFAULT_CSS)` (sem editor-only nem `@font-face`).

## EPUB já optimizado

Se o EPUB já está no formato da app (CSS = o do editor e todas as classes do texto existem nele — ex. um ficheiro de `optimizados/`), o `analyze` avisa (`alreadyOptimized`) e o `convert` devolve-o **tal e qual** (optimizar de novo perdia os `h1`/`h3`). Na app, a Importação InDesign importa-o logo, sem o modal. Original ou já optimizado: os dois entram pela Importação InDesign.

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
- **Decididos**: da casa → `estilos-base.json`; por livro → no modal, na importação.

## Títulos dos capítulos

- Só do `<title>` de cada ficheiro, nunca do nav (no InDesign traz o page-list → "1", "161"…).
- Vazio, sem letras/números ou = nome do ficheiro → sem título (junta ao anterior). Regra única: `chapterTitleOf` (`src/utils/chapter-title.ts`), usada pelo importador e pelo skill.
- Chamadas de nota fora do nome ("SOMBRA(143)" → "SOMBRA").
- Convert: parágrafo-rótulo de ficha técnica (começa por autor/autora/autores, revisão, capa, design da capa, ISBN; < 120 car.) → `Ficha Técnica` em qualquer página (as mesmas palavras a meio de um capítulo não contam) · ficha técnica (©/ISBN/"Título original") com título falso ou antes do Índice → `Ficha Técnica` · rótulo da ficha (só "Título"/"Título original", com ou sem ":"; "Sun Tzu disse:" é título real) noutra página → `Rosto` · antes do Índice (se houver Índice) com títulos/imagem → `Rosto`, títulos viram parágrafos · texto simples e dedicatórias mantêm o `<title>`.
- `<title>` repetido em vários ficheiros (ex. "Sun Tzu disse:") só cria **um** capítulo (o 1.º pela ordem de leitura); os seguintes ficam sem título e juntam-se ao anterior.
- Resultado típico: **Capa · Rosto · Ficha Técnica · Índice · capítulos**.

## Estrutura e limpeza (fixas)

- **Notas**: `a._idFootnoteLink` → `sup > a[noteref]` (nº sempre em `<sup>`); `section._idFootnotes` → `div.footnotes-section > aside.footnote` (o importador desembrulha e junta parágrafos com `<br>`).
- **Quebras de página**: mantêm `id`/`aria-label`; `<div>` → `<span>` vazio no parágrafo seguinte; conteúdo lá dentro (nº da nota) sai para a linha da nota.
- **Sai**: CSS/fontes do InDesign, `style=""`, classes de tabelas/imagens/listas/links, `<div>` contentores (id referenciado passa para o 1.º filho), âncoras `_idTextAnchor` vazias não referenciadas, hífenes discricionários (`U+00AD`, `&#173;`, `&shy;`), `nav` do spine.
- **`<br/>` do paginador** (parágrafos e notas; títulos nunca): o `analyze` conta por tipo — a meio da frase / depois do fim da frase → espaço; hífen ou barra repetidos → um; hífen no fim → junta; no início/fim do parágrafo → sai. **Nunca juntar sem perguntar**: mostrar o total, a contagem de cada tipo e o exemplo (antes → depois) e só com o "sim" usar `convert --juntar-br` (na app: caixa no modal, desligada por omissão). O verify trata `--`/`//` como `-`/`/`.
- **Fica**: nomes dos ficheiros, imagens, capa, OPF/metadados, `toc.ncx`, `nav` (com page-list).

## Diferenças intencionais no verify

Separadores `*` → `p-asterisk` (itálico) · nº da nota dentro da quebra → linha da nota ("sem par") · valores do editor (recuo 2.15em, espaço 30px, `p-small` 0.85em) ≠ original.

## Dependências na app

`src/utils/chapter-title.ts` (`chapterTitleOf`) · `src/services/epub-importer.ts` (títulos do `<title>`, notas com vários parágrafos inteiras, espaço no `<sup>` da nota) · `src/utils/html-cleaner.ts` (`flattenHeadingText` sem chamadas de nota).
