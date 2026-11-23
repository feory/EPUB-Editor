// Contrato entre o prompt/ferramentas do SERVIDOR (server/routes/ai.js) e o que o CLIENTE sabe validar e produzir. Os nomes, enums,
// limites e schemas vivem numa só fonte (shared/ai-contract.js) que as duas pontas leem; este teste verifica que cada ponta a usa
// por inteiro: o prompt descreve tudo o que o editor executa, e o editor executa tudo o que o servidor oferece ao modelo.
import { test, expect } from 'bun:test';
import '../src/services/indesign/happy-dom'; // DOMParser no bun (surveyBook)

process.env.JWT_SECRET ??= 'test-secret'; // config.js exige-o ao ser importado
const { SYSTEM, TOOLS } = await import('./routes/ai.js');
const { OP_TYPES } = await import('../src/pages/work/ai/aiPlan.ts');
const { RULE_ACTION_TYPES, RULE_SELECT_KEYS } = await import('../src/utils/book-rules.ts');
const { STYLE_PROPS: CLIENT_STYLE_PROPS } = await import('../src/utils/book-styles.ts');
const contract = await import('../shared/ai-contract.js');
const { surveyBook } = await import('../src/utils/book-survey.ts');

const preview = TOOLS.find((t) => t.name === 'preview_rules');
const text = `${SYSTEM}\n${preview.description}`;

// O editor executa estas operações, mas NÃO se oferecem ao modelo do chat: quem as aplica é a vista do texto alternativo (com revisão).
const NOT_FOR_THE_MODEL = ['set_image_alts'];
// Chaves do select que só o editor preenche (o bloco selecionado): o modelo não as escolhe.
const SELECT_SET_BY_EDITOR = ['block'];

test('cada operação que o editor executa está descrita ao modelo (menos as internas)', () => {
  expect(OP_TYPES.filter((t) => !NOT_FOR_THE_MODEL.includes(t) && !text.includes(`"${t}"`))).toEqual([]);
});

test('as operações internas não são expostas ao modelo', () => {
  for (const t of NOT_FOR_THE_MODEL) expect(text).not.toContain(t);
  expect(NOT_FOR_THE_MODEL.every((t) => OP_TYPES.includes(t))).toBe(true); // se a operação deixar de existir, tira-se daqui
});

test('cada ação e cada chave do select que o motor de regras entende está descrita ao modelo', () => {
  expect(RULE_ACTION_TYPES.filter((t) => !text.includes(`"${t}"`))).toEqual([]);
  expect(RULE_SELECT_KEYS.filter((k) => !SELECT_SET_BY_EDITOR.includes(k) && !text.includes(k))).toEqual([]);
  for (const k of SELECT_SET_BY_EDITOR) expect(text).not.toContain(`${k}:`);
});

test('o prompt traz TODAS as listas partilhadas (propriedades de estilo, correções, tipografia) e o editor usa as mesmas', () => {
  expect([...CLIENT_STYLE_PROPS]).toEqual([...contract.STYLE_PROPS]);
  for (const v of [...contract.STYLE_PROPS, ...contract.STYLE_KINDS, ...contract.TYPOGRAPHY_FIXES]) expect(text).toContain(v);
});

test('os parâmetros do preview_rules são os que o ciclo do cliente lê', async () => {
  const { PREVIEW_INPUT_KEYS } = await import('../src/pages/work/ai/tools/previewRules.ts');
  expect(Object.keys(preview.input_schema.properties).sort()).toEqual([...PREVIEW_INPUT_KEYS].sort());
  expect([...PREVIEW_INPUT_KEYS]).toEqual([...contract.PREVIEW_INPUT_KEYS]);
  expect(preview.input_schema.required).toEqual(['rules']);
});

test('os campos do survey_book que o prompt menciona existem mesmo no resumo', () => {
  const survey = surveyBook([], '');
  for (const field of ['inlineSpans', 'styleRules', 'allowedClasses', 'inlineStyles', 'audit', 'headingJumps', 'inlineStyleOutliers', 'styleUsage']) {
    expect(text).toContain(field);
  }
  for (const field of ['chapters', 'blocks', 'customStyles', 'inlineSpans', 'allowedClasses', 'styleRules', 'audit']) {
    expect(Object.keys(survey)).toContain(field);
  }
  expect(Object.keys(survey.audit).sort()).toEqual(['headingJumps', 'inlineStyleOutliers', 'omitted', 'styleUsage']);
});

test('as ferramentas do servidor são EXATAMENTE as do registo do cliente (um schema por ferramenta executável)', async () => {
  const { AI_TOOLS } = await import('../src/pages/work/ai/tools/index.ts');
  expect(TOOLS.map((t) => t.name).sort()).toEqual(AI_TOOLS.map((t) => t.name).sort());
});

test('cada ferramenta da especificação partilhada é oferecida ao modelo tal como está e tem tudo o que o painel e o prompt precisam', () => {
  expect(TOOLS.map((t) => t.name)).toEqual(Object.keys(contract.TOOL_SPECS));
  for (const t of TOOLS) {
    const spec = contract.TOOL_SPECS[t.name];
    expect(t.description).toBe(spec.description);
    expect(t.input_schema).toBe(spec.schema);
    expect(spec.step.length).toBeGreaterThan(0); // o que se mostra enquanto a ferramenta corre
    expect(SYSTEM).toContain(t.name); // o guia de quando a usar
  }
});

test('as validações do run_validation são as do editor (mais "all") e os limites da compressão valem no servidor', async () => {
  const { VALIDATION_ORDER } = await import('../src/utils/validation-digest.ts');
  expect([...contract.TOOL_SCHEMAS.run_validation.properties.type.enum].sort()).toEqual([...VALIDATION_ORDER, 'all'].sort());
  const { compressOptions } = await import('./image-compress.js');
  const { maxWidth, quality } = contract.COMPRESS_LIMITS;
  expect(compressOptions({ maxWidth: maxWidth.min, quality: quality.max }).error).toBeUndefined();
  expect(compressOptions({ maxWidth: maxWidth.min - 1 }).error).toBeDefined();
  expect(compressOptions({ quality: quality.max + 1 }).error).toBeDefined();
});
