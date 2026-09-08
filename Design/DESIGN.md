---
name: EPUB Platform
description: Ferramenta interna de produção editorial — importação, edição e exportação de ebooks EPUB3
colors:
  primary: "#0a0a0a"
  primary-hover: "#262626"
  neutral-bg: "#f8fafc"
  neutral-surface: "#ffffff"
  neutral-text: "#0f172a"
  neutral-text-muted: "#64748b"
  neutral-border: "#e2e8f0"
  success: "#10b981"
  destructive: "#f43f5e"
  destructive-text: "#e11d48"
  reversible: "#d97706"
typography:
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.05em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text-muted}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.neutral-bg}"
  input-search:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    height: "36px"
  card-panel:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.lg}"
---

# Design System: EPUB Platform

## 1. Overview

**Creative North Star: "A Secretária de Edição"**

Um móvel de trabalho neutro: superfície limpa, tudo à mão, nada a competir com o texto que está a ser editado. O sistema existe para desaparecer — cor quase ausente, hierarquia feita por peso e espaçamento, não por decoração. É uma ferramenta de produção usada em sessões longas e repetidas sobre o mesmo livro; qualquer floreado visual é atrito acumulado ao longo de centenas de cliques por dia.

Rejeita explicitamente: o SaaS genérico de creme-e-roxo-e-cards-empilhados, gradientes decorativos, glassmorphism como default, qualquer coisa que peça atenção a si própria em vez de à tarefa. Também rejeita o extremo oposto — a grelha cinzenta densa de ferramenta corporativa datada — através de espaçamento generoso e cantos suavizados que mantêm a densidade legível.

**Key Characteristics:**
- Quase monocromático: preto quase puro como único acento, usado com extrema raridade
- Hierarquia por peso tipográfico e cor de texto (main/muted), não por blocos de cor
- Sombras quase imperceptíveis; profundidade por contraste de fundo (surface branca sobre bg-color cinzento), não por elevação dramática
- Cantos consistentemente arredondados (8–16px) sem nunca ficar "fofo"

## 2. Colors

Paleta quase monocromática: uma escala de cinzentos-azulados (slate) carrega toda a interface; o único acento é um preto quase puro, reservado a estados ativos e texto de maior peso.

### Primary
- **Grafite Quase-Preto** (`#0a0a0a`): reservado a texto/ícone de maior ênfase e a estados ativos pontuais (badge de contagem do separador ativo, `bg-primary/10` + `text-primary`). Nunca preenche áreas grandes.

### Neutral
- **Névoa de Fundo** (`#f8fafc`): fundo da página — o "chão" sobre o qual as superfícies brancas flutuam.
- **Superfície Branca** (`#ffffff`): cartões, painéis, modais, inputs em foco.
- **Texto Principal** (`#0f172a`): títulos, valores, conteúdo primário.
- **Texto Discreto** (`#64748b`): labels, metadados, texto secundário — a maioria do texto da interface usa este tom, não o principal.
- **Fronteira** (`#e2e8f0`): todas as bordas e divisórias; nunca preto puro.

### Semantic
- **Sucesso** (`#10b981`, emerald): confirmação de ações (import/export concluído, validação passada).
- **Destrutivo/Erro** (`#f43f5e` preenchimentos, `#e11d48` texto legível, rose): falhas de validação e QUALQUER ação irreversível — apagar definitivamente, limpar histórico. Nunca usado para uma ação reversível (ver Regra da Reversibilidade, abaixo).
- **Reversível** (`#d97706`, amber): confirmar uma ação recuperável — enviar para a Reciclagem (30 dias para desfazer). Só em ícone/preenchimento pequeno, nunca em texto corrido (tom escolhido para contraste de ícone, não de leitura longa).

### Named Rules
**A Regra do Acento Raro.** O preto quase puro (`#0a0a0a`) nunca preenche uma superfície inteira. É texto, ícone ou um fundo a 10% de opacidade (`bg-primary/10`) — nunca um botão sólido de largura total. A cor identifica estado, não decora.

**A Regra da Reversibilidade.** Confirmar uma ação recuperável (enviar para a Reciclagem, 30 dias para desfazer) usa `amber`. Confirmar uma ação irreversível (apagar definitivamente, limpar histórico) usa `rose`. A cor do botão de confirmação comunica se há ou não volta atrás — nunca a mesma cor para os dois casos.

## 3. Typography

**Display/Body Font:** Inter, com fallback `system-ui, -apple-system, sans-serif`.

**Character:** Uma única família sans-serif técnica para toda a interface de produto — sem serifa, sem personalidade emprestada. (As serifas do projeto — Lora, EB Garamond, Source Serif 4, Crimson Text — existem só como preview de fontes do EPUB editado, nunca na chrome da própria ferramenta.)

### Hierarchy
- **Title** (700, 1.25rem/20px, 1.5): título de página/logo, cabeçalhos de modal.
- **Body** (400–600, 0.875rem/14px, 1.5): a esmagadora maioria do texto de interface — botões, células de tabela, corpo de formulário.
- **Label** (700, 0.75rem/12px, letter-spacing 0.05em, uppercase): cabeçalhos de coluna de tabela, etiquetas de campo — sempre `text-text-muted`, nunca o texto principal.

### Named Rules
**A Regra do Peso, Não do Tamanho.** A escala de tamanhos é estreita (12/14/20px); hierarquia visual vem do contraste peso (400 vs 700) e cor (texto principal vs discreto), não de saltos grandes de tamanho.

## 4. Elevation

Sistema quase plano. Duas sombras apenas, ambas muito subtis (`--shadow-sm`, `--shadow-md`); nada acima disso à exceção de dropdowns/modais que precisam de se destacar fisicamente da página (`shadow-lg`/`shadow-xl`, usados com moderação em popovers de menu e no botão flutuante de ações). Profundidade estrutural vem sobretudo do contraste tonal — superfície branca sobre fundo `#f8fafc` — não de sombra.

### Shadow Vocabulary
- **sm** (`0 1px 2px 0 rgb(0 0 0 / 0.05)`): estado de repouso de cartões/painéis.
- **md** (`0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): pré-visualização de capa, elementos que precisam de mais separação do fundo.
- **lg/xl** (utilitários Tailwind padrão): reservadas a overlays temporários — dropdowns de menu, botão de ação flutuante, modais — nunca a conteúdo estático da página.

### Named Rules
**A Regra do Plano-Por-Omissão.** Superfícies estáticas ficam em `shadow-sm` ou sem sombra nenhuma. Sombra mais pesada (`lg`/`xl`) é reservada a elementos que se sobrepõem fisicamente a outro conteúdo (menus, modais) — nunca decoração de repouso.

## 5. Components

Contidos e sólidos: sem lengalenga visual, cinzentos neutros em repouso, feedback mínimo mas claro no clique (`active:scale-95`).

### Buttons
- **Shape:** cantos 8px (`rounded-lg`).
- **Primary/Toolbar:** fundo `slate-100`, texto `slate-600`, sombra `shadow-sm`; nunca preenchido a preto — mesmo o botão "principal" da toolbar usa o mesmo cinzento neutro dos restantes.
- **Hover / Focus:** `hover:bg-slate-200`; clique dá feedback físico com `active:scale-95` em vez de mudança de cor adicional.
- **Ghost/Ícone:** botões de ação em tabela (metadados, download, reabrir) são só ícone, `p-2 rounded-lg border border-border`, sobem para `hover:bg-slate-100` + `hover:text-slate-700`.
- **Ativo/Selecionado:** único uso do acento primário — `bg-primary/10 text-primary` no separador de tabs ativo.

### Inputs / Fields
- **Style:** fundo `slate-50`, borda `border-border`, cantos 8px (`rounded-lg`), altura 36px (`h-9`).
- **Focus:** fundo sobe a branco (`focus:bg-white`), borda troca para `primary`, anel de foco suave (`focus:ring-2 focus:ring-primary/20`).
- **Largura:** pesquisa de tabela tem largura fixa (256px, `w-64`) independente de estar vazia ou com resultados — nunca esticar para preencher a linha.

### Cards / Containers
- **Corner Style:** painéis principais 12px (`rounded-xl`); modais 16px (`rounded-2xl`).
- **Background:** branco sobre fundo `#f8fafc`.
- **Shadow Strategy:** `shadow-sm` (painéis) a `shadow-md` (modais) — ver Elevation.
- **Border:** `border border-border` em quase todos os contentores, mesmo com sombra — a borda faz o trabalho de definição, a sombra é só apoio.

### Navigation
- **Estilo:** barra superior fixa (`sticky top-0`), fundo branco, borda inferior única. Tabs por peso/cor de texto + badge de contagem, sem sublinhado nem pílula de fundo colorida a competir com o acento raro.
- **Menus/Dropdowns:** `rounded-xl`, `shadow-xl`, itens `hover:bg-slate-200`; sub-menus aninhados (ex. Ferramentas → Auxílio) abrem lateralmente e ficam ordenados alfabeticamente por convenção — previsibilidade de posição vence agrupamento temático quando a lista cresce.

### Tabelas (componente de assinatura)
Padrão recorrente em todas as listagens (Em Progresso, Concluídos, Painel): cabeçalho `bg-slate-50/50`, labels em maiúsculas discretas, linhas com `hover:bg-slate-50/80`, ações reveladas em ícones à direita. A última coluna acomoda sempre a pesquisa com largura reservada fixa — abrir/fechar a pesquisa nunca reflui as colunas vizinhas.

## 6. Do's and Don'ts

### Do:
- **Do** manter o preto (`#0a0a0a`) como acento raro — texto, ícone, ou `/10` de opacidade, nunca uma superfície sólida grande.
- **Do** usar `slate-100`/`slate-200` para todos os botões de ação, mesmo os "principais" da toolbar.
- **Do** reservar sombra `lg`/`xl` a overlays (menus, modais) que se sobrepõem a outro conteúdo.
- **Do** dar largura fixa a controlos que alternam de tamanho (pesquisa colapsável) para nunca deslocar colunas vizinhas.
- **Do** ordenar menus longos (Ferramentas → Auxílio) alfabeticamente quando não há agrupamento temático óbvio.
- **Do** usar `amber` para confirmar uma ação reversível e `rose` para confirmar uma irreversível — nunca a mesma cor para as duas.

### Don't:
- **Don't** usar SaaS genérico — creme/roxo, cards empilhados sem necessidade, gradiente decorativo, glassmorphism default (anti-referências gerais do produto).
- **Don't** usar `border-left`/`border-right` colorido como acento decorativo em cartões ou linhas de lista.
- **Don't** aplicar gradiente a texto (`background-clip: text`) para ênfase — usar peso ou cor sólida.
- **Don't** deixar um controlo colapsável (pesquisa, filtros) esticar para preencher a linha quando vazio — reservar a largura sempre.
- **Don't** empilhar sombras pesadas em conteúdo estático; o sistema é plano por omissão.
- **Don't** introduzir uma segunda cor de acento (ex. emerald) num badge/indicador que já é diferenciado por posição ou texto — reservar cor extra a estados semânticos reais (sucesso, destrutivo), nunca a repetir o que a label já diz.
