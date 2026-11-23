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
  'tag', 'hasClass', 'noClass', 'hasStyle', 'startsWith', 'afterHeading', 'afterClass', 'beforeClass',
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
