import type { ImportOptions } from '../../../utils/html-cleaner';

export interface ConversionOption {
    key: keyof ImportOptions;
    label: string;
    description: string;
}

// Conversões disponíveis tanto na importação como no menu Ferramentas do editor.
export const CONVERSION_OPTIONS: ConversionOption[] = [
    {
        key: 'topOnBoldParagraphs',
        label: 'Espaçamento superior nos parágrafos negrito',
        description: 'Parágrafos totalmente a negrito ganham espaço extra acima e ficam sem indentação.',
    },
    {
        key: 'noIndentAfterBold',
        label: 'Sem Indentação no 1º Parágrafo',
        description: 'O parágrafo imediatamente a seguir a um parágrafo totalmente a negrito fica sem indentação.',
    },
    {
        key: 'wrapBoldWithNext',
        label: 'União de Parágrafos',
        description: 'Mantém o parágrafo a negrito e o parágrafo seguinte juntos na mesma página, sem quebra entre eles (div noBreak).',
    },
    {
        key: 'convertListsToDialogue',
        label: 'Converter Listas em Diálogo (—)',
        description: 'Listas com marcas viram parágrafos de diálogo com travessão. Para romances; deixar desmarcado em livros com listas reais (académicos).',
    },
];
