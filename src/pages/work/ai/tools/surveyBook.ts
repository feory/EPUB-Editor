import { surveyBook } from '../../../../utils/book-survey';
import type { AiTool } from './aiTool';

export const surveyBookTool: AiTool = {
    name: 'survey_book',
    run: (_input, { workspace }) => ({ content: JSON.stringify(surveyBook(workspace.parts(), workspace.css())) }),
};
