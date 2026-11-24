// O CONTRATO do assistente de IA que o servidor e o cliente partilham: o que o modelo pode pedir (nomes, enums, limites e
// schemas dos argumentos das ferramentas). É só dados, sem imports: o servidor (server/routes/ai.js, que o injeta no prompt e nos
// schemas) e o editor (que valida e executa) leem daqui, por isso as duas pontas não podem divergir. O texto em prosa que explica
// tudo ao modelo continua à mão em server/routes/ai.js; server/ai-contract.test.js verifica as pontas.
// O Dockerfile copia esta pasta (o servidor corre sem src/).

/** Propriedades CSS que um estilo novo/alterado pode ter. */
export const STYLE_PROPS = /** @type {const} */ ([
  'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height', 'letter-spacing',
  'text-align', 'text-indent', 'text-transform', 'color', 'background-color', 'background', 'border-radius',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border-top', 'border-bottom', 'border-left', 'border-right',
]);

/** Ações e chaves do select do motor de regras (src/utils/book-rules.ts verifica, em compilação, que são todas as do seu tipo). */
export const RULE_ACTION_TYPES = /** @type {const} */ (['addClass', 'removeClass', 'removeStyle', 'unwrap', 'wrap', 'keepTogether', 'retag', 'delete']);
export const RULE_SELECT_KEYS = /** @type {const} */ ([
  'tag', 'hasClass', 'noClass', 'hasStyle', 'startsWith', 'startsCase', 'afterHeading', 'afterClass', 'beforeClass', 'notAfterClass',
  'following', 'chapters', 'exceptChapters', 'deep', 'position', 'block',
]);

/** Correções de `fix_styles` e de `typography`; validações de `run_validation` (pela ordem em que `all` as corre). */
export const STYLE_KINDS = /** @type {const} */ (['indent', 'emphasis', 'center', 'small', 'spacing']);
export const TYPOGRAPHY_FIXES = /** @type {const} */ (['quotes', 'dashes', 'ellipsis', 'spaces']);
export const VALIDATION_ORDER = /** @type {const} */ (['footnotes', 'links', 'epub', 'accessibility']);

/** Limites da compressão de imagens (servidor valida, cliente e modelo respeitam). */
export const COMPRESS_LIMITS = {
  maxWidth: { min: 400, max: 6000, default: 1600 },
  quality: { min: 40, max: 95, default: 82 },
};

/** Os parâmetros do preview_rules. */
export const PREVIEW_INPUT_KEYS = /** @type {const} */ (['rules', 'styles', 'style_edits', 'style_deletes', 'operations']);

const none = { type: 'object', properties: {} };

/** O schema dos argumentos de cada ferramenta (as descrições para o modelo ficam em server/routes/ai.js). */
export const TOOL_SCHEMAS = {
  survey_book: none,
  preview_rules: {
    type: 'object',
    properties: {
      rules: { type: 'array', items: { type: 'object' }, description: 'Lista de regras { select, action }.' },
      styles: { type: 'array', items: { type: 'object' }, description: 'Estilos de parágrafo novos { name, props } (opcional).' },
      style_edits: { type: 'array', items: { type: 'object' }, description: 'Alterações a estilos existentes { cls, props } (opcional).' },
      style_deletes: { type: 'array', items: { type: 'string' }, description: 'Classes de estilos do utilizador a APAGAR, sem o ponto (opcional). Só os que nada usa.' },
      operations: { type: 'array', items: { type: 'object' }, description: 'Operações do editor { type, … } (opcional).' },
    },
    required: ['rules'],
  },
  check_publication: none,
  check_page_list: none,
  check_styles: none,
  check_figures: none,
  check_text: none,
  search_docs: { type: 'object', properties: { query: { type: 'string', description: 'A pergunta ou as palavras-chave do assunto.' } }, required: ['query'] },
  find_text: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'O texto a procurar (2–120 caracteres).' },
      chapters: { type: 'array', items: { type: 'integer' }, description: 'Só estes capítulos (índices do survey_book). Opcional.' },
      limit: { type: 'integer', description: 'Máximo de resultados (até 20). Opcional.' },
    },
    required: ['query'],
  },
  build_report: none,
  compress_images: {
    type: 'object',
    properties: {
      max_width: { type: 'integer', description: `Largura máxima em píxeis (${COMPRESS_LIMITS.maxWidth.min}–${COMPRESS_LIMITS.maxWidth.max}). Por omissão ${COMPRESS_LIMITS.maxWidth.default}.` },
      quality: { type: 'integer', description: `Qualidade JPEG/WebP (${COMPRESS_LIMITS.quality.min}–${COMPRESS_LIMITS.quality.max}). Por omissão ${COMPRESS_LIMITS.quality.default}.` },
    },
  },
  run_validation: {
    type: 'object',
    properties: { type: { type: 'string', enum: ['accessibility', 'epub', 'footnotes', 'links', 'all'], description: '"accessibility" (ACE, por omissão), "epub" (EPUBCheck), "footnotes", "links" ou "all" (todas, por ordem: notas, links, epub, accessibility).' } },
  },
};

const RULES_DOC = `Lista de regras, aplicadas por ordem (a seguinte vê o resultado da anterior). Cada regra: { select, action }.
select: { tag: string[] (obrigatório, minúsculas, ex. ["p"]), hasClass?: string[] (tem todas), noClass?: string[] (não tem nenhuma), hasStyle?: string[] (o atributo style inline tem todas estas propriedades, ex. ["margin-left"]), startsWith?: string (o texto do bloco começa por isto, 2–120 caracteres: aponta para UM título ou parágrafo concreto, p. ex. o que um relatório de validação cita), startsCase?: "lower"|"upper" (a 1.ª LETRA do texto, sem contar aspas, travessões ou números, é minúscula/maiúscula; "lower" apanha os parágrafos que continuam o anterior, p. ex. a 2.ª parte de uma citação partida: hasClass ["p-quote"] + startsCase "lower"),
afterHeading?: ("h1"|"h2"|"h3")[] (o bloco de conteúdo imediatamente anterior é um destes títulos; salta marcadores, âncoras, hr e vazios),
afterClass?: string[] (o bloco de conteúdo imediatamente anterior tem TODAS estas classes, ex. ["p-top","p-bottom","p-bold"]: apanha só o parágrafo a seguir a cada um; salta marcadores, âncoras, hr e vazios; com following:true apanha TODOS os blocos a seguir, até ao próximo bloco com essas classes, um título h1–h3 ou o fim do capítulo: é o que serve para "todos os parágrafos entre blocos X"; usa noClass para deixar de fora os que já têm outro estilo),
beforeClass?: string[] (o inverso de afterClass: o bloco de conteúdo imediatamente SEGUINTE tem TODAS estas classes, ex. o parágrafo que vem antes de uma citação),
notAfterClass?: string[] (a negação de afterClass: o bloco de conteúdo imediatamente anterior NÃO tem TODAS estas classes; salta marcadores, âncoras, hr e vazios. Com hasClass igual dá o PRIMEIRO de cada sequência seguida: hasClass ["p-quote"] + notAfterClass ["p-quote"] = o 1.º parágrafo de cada conjunto de citações; é o que serve para "o primeiro de cada conjunto/bloco seguido"),
following?: boolean (com afterClass ou afterHeading: todos os blocos seguintes, não só o imediato; com afterHeading acaba no próximo título h1–h3, ou seja "todos os parágrafos de cada secção"),
chapters?: number[] , exceptChapters?: number[] (índices do survey), position?: "first"|"last" (só o primeiro/último irmão: com tag ["li"] e deep:true, o primeiro item de CADA lista), deep?: boolean (por omissão só filhos diretos do corpo; não se combina com afterHeading, afterClass nem beforeClass) }.
action: { type: "addClass"|"removeClass", value: string } | { type: "removeStyle", props: string[] } (tira essas propriedades do atributo style inline; o resto do style fica) | { type: "unwrap", tags: ("strong"|"b"|"em"|"i"|"u")[] } (tira essas etiquetas de DENTRO do bloco, deixando o texto: é assim que se tira negrito/itálico/sublinhado que está em <strong>/<b>/<em>/<i>/<u> e não numa classe nem style; usa select.tag do bloco, p. ex. ["p"]. Negrito: ["strong","b"]) | { type: "wrap", tag: "strong"|"b"|"em"|"i"|"u", text?: string } (o inverso de unwrap: põe o conteúdo do bloco em <strong> etc.; com "text" só as ocorrências desse texto (dentro de um mesmo nó de texto, até 200 caracteres). Serve para repor negrito/itálico retirado: sem "text" todo o bloco; se só parte era negrito, usa "text" com essa parte) | { type: "retag", to: "p"|"h2"|"h3"|"h4"|"h5"|"h6" } (para "h2" só a partir de h3–h6; não cria capítulo, é só o nível do título) | { type: "delete" } | { type: "keepTogether", withNext?: boolean } (MANTER JUNTOS NA PAGINAÇÃO, sem quebra de página entre eles — NÃO funde parágrafos: põe os blocos num bloco "União" (div noBreak). Sem "withNext": os blocos selecionados que são seguidos ficam num só grupo (precisa de 2 ou mais seguidos); com "withNext": true cada bloco selecionado fica unido ao bloco a seguir, p. ex. um título + o parágrafo seguinte, ou um parágrafo isolado + o seguinte). Quando o utilizador pede "juntar"/"manter juntos" blocos que NÃO são figuras, é esta ação; para figuras usa a operação keep_figures_together.
Acrescentar p-indent tira p-non-indent e vice-versa. Os blocos do survey_book trazem "inlineStyles" (os style inline mais comuns). Se o aspeto que o utilizador quer mudar vem de um style inline (ex. margin-left, text-indent), REMOVE-o com removeStyle (select com hasStyle) em vez de o sobrepor com uma classe: o inline vence as classes e o resultado ficaria igual.
styles (opcional): [{ name: string, kind?: "paragraph"|"char", props: { [propriedade]: valor } }] cria estilos NOVOS: kind "paragraph" (por omissão) = classe do nome em minúsculas com hífenes; kind "char" = estilo de caracteres, classe "c-nome" (aplica-se a <span class>) que as regras já podem usar. Propriedades permitidas: ${STYLE_PROPS.join(', ')}. Outra propriedade é recusada. Valores simples (ex. "0.9em", "1.5em", "center", "#555"), sem funções nem url(). Falha se o estilo já existir.
style_edits (opcional): [{ cls: string, props: { [propriedade]: valor } }] ALTERA estilos que já existem: os do editor (como p-quote) e os do utilizador (cls sem o ponto, ver allowedClasses) e também os títulos "h1", "h2" e "h3" (cls = "h1"…). Sem regra no livro, os títulos têm por omissão font-size 2em (h1), 1.5em (h2) e 1.17em (h3). Valor "" remove a propriedade. O valor atual de cada estilo está em styleRules do survey_book: usa-o para pedidos relativos (ex. "10% mais pequeno"). Não se desfaz pelo histórico: só propõe edições pedidas pelo utilizador.
style_deletes (opcional): [cls, …] APAGA estilos do utilizador (cls sem o ponto) que NINGUÉM usa: o editor recusa os que estão em uso (e diz quantas vezes), e só vale depois das regras do mesmo pedido, por isso "tira a classe X e apaga o estilo X" cabe num só preview_rules. Só apagas os que o utilizador pediu; os candidatos estão em audit.styleUsage.unused do survey_book. Apagar não se desfaz sozinho, mas o Reverter do registo repõe o CSS de antes.
operations (opcional): operações do editor, executadas por ordem DEPOIS das regras: [{ type: "drop_caps" } (capitular no 1.º parágrafo de cada capítulo), { type: "link_index" } (liga as entradas do Índice aos capítulos), { type: "fix_links" } (corrige o espaçamento dos links que já existem; NÃO cria ligações: os endereços escritos no texto, "http://…", "https://…" e "www.…", já ficam clicáveis sozinhos na exportação do EPUB, porque o editor não guarda ligações; por isso "endereços no texto" não é um problema do livro nem precisa de operação, e só ficam por converter os que têm um espaço ou quebra no meio), { type: "replace_text", find, replace } (substitui texto em TODO o livro; find 2–200 caracteres, sem < > " & =; replace sem < >), { type: "rename_chapter", index, title }, { type: "set_chapter_level", index, level: "h1"|"h2"|"h3" }, { type: "hide_chapter", index, hidden: true|false } (esconde/mostra o capítulo no Índice do EPUB), { type: "fix_page_list" } (insere os marcadores de página que faltam, a partir do PDF de impressão carregado; sem campos), { type: "fix_styles", kinds?: [${STYLE_KINDS.map((k) => `"${k}"`).join("|")}] } (corrige indentação, negrito/itálico, centrado, letra pequena e espaço acima dos parágrafos soltos segundo o PDF de impressão carregado; sem "kinds" faz todos; o editor junta os dados do PDF), { type: "fix_figures" } (põe as figuras com legenda no sítio que o PDF de impressão carregado indica e acerta a ordem imagem/legenda; sem campos; o editor junta os dados do PDF), { type: "keep_figures_together" } (põe cada figura com legenda — imagem(ns) + legenda — num bloco "União" (div noBreak): sem quebra de página entre elas; sem campos; idempotente; usa-a DEPOIS de fix_figures, na mesma proposta se for preciso — o que já está unido deixa de ser movido por fix_figures), { type: "typography", fixes?: [${TYPOGRAPHY_FIXES.map((k) => `"${k}"`).join("|")}] } (tipografia portuguesa em TODO o livro, só em texto: "quotes" aspas retas/curvas → «…»; "dashes" travessão de diálogo no início do parágrafo e " - " → " – "; "ellipsis" "..." → "…"; "spaces" espaços duplicados e antes de pontuação; sem "fixes" faz as quatro; blocos com aspas desemparelhadas ficam como estavam e são contados), { type: "inline_style_to_class", style: { propriedade: valor }, cls: "c-nome", scope?: ["h1"] } (troca os <span style="…"> cujo style é EXATAMENTE esse — ordem/maiúsculas não contam — por <span class="cls">; scope limita a spans dentro dessas tags)]. index = índice do capítulo no survey_book. Não há operações para mover, eliminar ou criar capítulos: diz ao utilizador que o faça no editor de capítulos. O resultado traz "operations" com o que cada uma faria (changed=false: já estava feito).`;

/**
 * UMA entrada por ferramenta do assistente — o que o servidor oferece ao modelo (`description`, `schema`) e o que o painel mostra enquanto
 * ela corre (`step`). A ordem é a do prompt (server/routes/ai.js `TOOLS`). O que a ferramenta FAZ está no cliente (src/pages/work/ai/tools/);
 * o guia de quando a usar é um parágrafo do SYSTEM em server/routes/ai.js. Acrescentar uma ferramenta = uma entrada aqui, o seu módulo no
 * cliente (registado em tools/index.ts) e esse parágrafo; server/ai-contract.test.js falha se alguma destas pontas faltar.
 */
export const TOOL_SPECS = {
  survey_book: {
    step: 'A ler o livro…',
    description: 'Resumo do livro: capítulos (índice, título, nível), blocos por "tag.classe1.classe2" com contagem, nº de capítulos e exemplos de texto, estilos criados pelo utilizador e a auditoria (audit: anomalias de formatação). Sem argumentos.',
    schema: TOOL_SCHEMAS.survey_book,
  },
  preview_rules: {
    step: 'A simular as alterações…',
    description: `Simula regras sobre o livro SEM alterar nada. Devolve erros de validação, ou por regra: blocos que mudariam, capítulos afetados e exemplos antes/depois. ${RULES_DOC}`,
    schema: TOOL_SCHEMAS.preview_rules,
  },
  check_publication: {
    step: 'A verificar a publicação (inclui as validações)…',
    description: 'Lista de verificação antes de exportar: metadados, capa, texto alternativo das imagens, entradas do Índice, lista de páginas e as quatro validações (notas, links, EPUBCheck, ACE). Devolve itens com estado ok/falta/aviso/info e onde resolver. Sem argumentos. Demora uns segundos.',
    schema: TOOL_SCHEMAS.check_publication,
  },
  check_page_list: {
    step: 'A comparar a lista de páginas com o PDF…',
    description: 'Cruza o PDF de impressão com os marcadores de página do livro e devolve que páginas ficaram sem marcador e porquê (em branco, do Índice, só figura, abre com figura, ou texto no livro mas fora de ordem). Não altera nada.',
    schema: TOOL_SCHEMAS.check_page_list,
  },
  check_styles: {
    step: 'A comparar os estilos com o PDF…',
    description: 'Compara o estilo dos parágrafos do livro (indentação, negrito/itálico, centrado, letra pequena, espaço acima) com o PDF de impressão e devolve as diferenças agrupadas por tipo, com exemplos. Não altera nada. Falha se não há PDF carregado.',
    schema: TOOL_SCHEMAS.check_styles,
  },
  check_figures: {
    step: 'A comparar as figuras com o PDF…',
    description: 'Compara a posição das figuras com legenda do livro com a ordem de leitura do PDF de impressão e devolve as que estão fora do sítio (2+ páginas do texto) ou com imagem e legenda trocadas. Não altera nada. Falha se não há PDF carregado.',
    schema: TOOL_SCHEMAS.check_figures,
  },
  check_text: {
    step: 'A comparar o texto com o PDF…',
    description: 'Compara o TEXTO do livro com o do PDF de impressão e devolve as linhas do PDF que não estão no livro (texto perdido ou alterado), por página. Não altera nada. Falha se não há PDF carregado.',
    schema: TOOL_SCHEMAS.check_text,
  },
  search_docs: {
    step: 'A consultar os guias…',
    description: 'Procura nos guias da aplicação (Como fazer, Editor, Assistente) as secções que respondem a uma pergunta de "como faço X?". Devolve o texto das secções. Não altera nada.',
    schema: TOOL_SCHEMAS.search_docs,
  },
  find_text: {
    step: 'A procurar no livro…',
    description: 'Procura texto nos blocos de topo do livro (sem acentos nem maiúsculas) e devolve até 20 resultados: capítulo (índice e título), posição do bloco, tag.classes, nº de ocorrências, se o bloco COMEÇA pelo texto e um excerto. Não altera nada.',
    schema: TOOL_SCHEMAS.find_text,
  },
  build_report: {
    step: 'A preparar o relatório (corre as validações)…',
    description: 'Prepara um relatório em texto com todas as falhas detetadas (publicação, lista de páginas, estilos e figuras contra o PDF, validações), cada uma com a localização e um excerto do texto, e entrega-o à interface para descarregar em .txt. Sem argumentos. Demora (corre as validações). Não altera o livro.',
    schema: TOOL_SCHEMAS.build_report,
  },
  compress_images: {
    step: 'A comprimir as imagens…',
    description: 'Comprime as imagens do livro no servidor: reduz as mais largas que max_width (nunca amplia) e recodifica PNG/JPEG/WebP no mesmo formato, mantendo nome e extensão (o livro não muda). GIF fica como está. DESTRUTIVO e sem volta atrás: só quando o utilizador pede explicitamente para comprimir/reduzir o peso das imagens. Devolve quantas imagens, o tamanho antes/depois e a poupança. Falha em modo leitura.',
    schema: TOOL_SCHEMAS.compress_images,
  },
  run_validation: {
    step: 'A correr a validação…',
    description: 'Corre validações do livro sobre o estado atual e devolve, por validação, ok ou o relatório agrupado por regra (gravidade, contagem, descrição, ficheiros e exemplos de HTML). As do EPUB demoram uns segundos. Falha em modo leitura.',
    schema: TOOL_SCHEMAS.run_validation,
  },
};
