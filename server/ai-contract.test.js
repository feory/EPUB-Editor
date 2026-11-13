// Contrato entre o prompt/ferramentas do SERVIDOR (server/routes/ai.js) e o que o CLIENTE sabe validar e produzir. O servidor não
// importa de src/, por isso o mesmo contrato está escrito duas vezes (prosa para o modelo, código para o editor); este teste
// falha se um lado ficar para trás — antes, só se descobria em produção, quando o modelo propunha algo que o editor recusava.
import { test, expect } from 'bun:test';
import '../src/services/indesign/happy-dom'; // DOMParser no bun (surveyBook)

process.env.JWT_SECRET ??= 'test-secret'; // config.js exige-o ao ser importado
const { SYSTEM, TOOLS } = await import('./routes/ai.js');
const { OP_TYPES } = await import('../src/pages/work/ai/aiPlan.ts');
const { RULE_ACTION_TYPES, RULE_SELECT_KEYS } = await import('../src/utils/book-rules.ts');
const { STYLE_PROPS } = await import('../src/utils/book-styles.ts');
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

test('a lista de propriedades de estilo do prompt é EXATAMENTE a que o editor aceita', () => {
  const listed = /Propriedades permitidas: ([\w, -]+)\./.exec(text)?.[1].split(',').map((s) => s.trim());
  expect(listed).toBeDefined();
  expect([...listed].sort()).toEqual([...STYLE_PROPS].sort());
});

test('os parâmetros do preview_rules são os que o ciclo do cliente lê', async () => {
  const { PREVIEW_INPUT_KEYS } = await import('../src/pages/work/ai/aiAgent.ts');
  expect(Object.keys(preview.input_schema.properties).sort()).toEqual([...PREVIEW_INPUT_KEYS].sort());
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

test('as ferramentas do servidor são as que o cliente executa (survey_book, preview_rules, run_validation e check_publication)', () => {
  expect(TOOLS.map((t) => t.name).sort()).toEqual(['check_publication', 'preview_rules', 'run_validation', 'survey_book']);
});
