// O registo das ferramentas do assistente. Acrescentar uma = um módulo novo aqui + o seu schema em server/routes/ai.js
// (server/ai-contract.test.js falha se os nomes divergirem).
import type { AiTool } from './aiTool';
import { surveyBookTool } from './surveyBook';
import { previewRulesTool } from './previewRules';
import { runValidationTool } from './runValidation';
import { checkPublicationTool } from './checkPublication';
import { checkPageListTool } from './checkPageList';
import { checkStylesTool } from './checkStyles';
import { checkFiguresTool } from './checkFigures';
import { buildReportTool } from './buildReport';
import { searchDocsTool } from './searchDocs';
import { findTextTool } from './findText';

export const AI_TOOLS: readonly AiTool[] = [surveyBookTool, previewRulesTool, runValidationTool, checkPublicationTool, checkPageListTool, checkStylesTool, checkFiguresTool, buildReportTool, searchDocsTool, findTextTool];
