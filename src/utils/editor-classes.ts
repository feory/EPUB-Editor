// Vocabulário das classes que o editor entende, com os TRAÇOS de cada uma. Dono único: as perguntas "que classes se tiram de
// um título?", "quais controlam a indentação?", "quais se excluem?" são consultas a esta tabela, não listas copiadas por cada
// módulo (editor, limpeza do HTML, importação, regras da IA). Classe nova = uma linha aqui. Sem imports.
//
// Os VALORES de CSS não vivem aqui (diferem por contexto: o editor usa .p-indent 2.15em, o EPUB 1.5em — ver StyleContext.tsx e
// epub-service.ts). Etiquetas e menus são do editor: BLOCK_STYLES em pages/work/editor/blockStyles.ts.

interface Traits {
    /** Marcador/estrutura do livro (notas, quebras, números de página): nunca se acrescenta a um bloco por regra. */
    structural?: true;
    /** Não faz sentido num título: sai do bloco quando este vira h1–h6. (p-center e p-space aguentam-se num título.) */
    notInHeading?: true;
    /** Já decide a indentação do parágrafo: "indentar tudo" não lhe mexe. */
    controlsIndent?: true;
    /** Indentação com semântica PRÓPRIA: "sem indentação após negrito" não a sobrepõe (ao contrário de p-indent/p-non-indent). */
    specialIndent?: true;
    /** Estilo escolhido pelo utilizador: a deteção automática de alínea não o substitui. */
    protectsFromAlinea?: true;
    /** Título/rótulo: o espaço acima passa ao parágrafo seguinte. */
    titleLike?: true;
    /** Não coexiste com esta: acrescentar uma tira a outra. */
    excludes?: string;
}

const STYLE_TRAITS: Record<string, Traits> = {
    'p-indent': { notInHeading: true, controlsIndent: true, protectsFromAlinea: true, excludes: 'p-non-indent' },
    'p-non-indent': { notInHeading: true, controlsIndent: true, excludes: 'p-indent' },
    'p-top': { notInHeading: true },
    'p-space': {},
    'p-small': { notInHeading: true, protectsFromAlinea: true },
    'p-bold': { notInHeading: true, controlsIndent: true, protectsFromAlinea: true, titleLike: true },
    'p-italic': { notInHeading: true, protectsFromAlinea: true, titleLike: true },
    'p-bold-italic': { notInHeading: true, controlsIndent: true, protectsFromAlinea: true },
    'p-uppercase': { notInHeading: true, protectsFromAlinea: true, titleLike: true },
    'p-center': { controlsIndent: true, specialIndent: true, protectsFromAlinea: true },
    'p-quote': { notInHeading: true, protectsFromAlinea: true },
    'p-legendas': { notInHeading: true, protectsFromAlinea: true },
    'p-asterisk': { notInHeading: true, controlsIndent: true, specialIndent: true, protectsFromAlinea: true },
    'p-border-top': { notInHeading: true, controlsIndent: true, specialIndent: true },
    'p-border-bottom': { notInHeading: true, controlsIndent: true, specialIndent: true },
    'p-border-sides': { notInHeading: true, controlsIndent: true, specialIndent: true },
    'footnote': { structural: true, notInHeading: true, controlsIndent: true, specialIndent: true, protectsFromAlinea: true },
    'footnote-ref': { structural: true },
    'drop-cap': { notInHeading: true, controlsIndent: true, specialIndent: true, protectsFromAlinea: true },
    'alinea': { notInHeading: true, controlsIndent: true, specialIndent: true },
    'chapter-break': { structural: true },
    'pagebreak': { structural: true },
    'small-caps': {},
    'underline': {},
    'img-left': {},
    'img-center': {},
    'img-right': {},
};

/** Todas as classes que o editor entende (as do EPUB antigo passam intactas na importação). */
export const EDITOR_CLASSES: ReadonlySet<string> = new Set(Object.keys(STYLE_TRAITS));

const withTrait = (trait: keyof Traits): string[] => Object.entries(STYLE_TRAITS).filter(([, t]) => t[trait]).map(([cls]) => cls);

export const STRUCTURAL_CLASSES = withTrait('structural');
export const HEADING_STRIPPED_CLASSES = withTrait('notInHeading');
export const INDENT_CONTROLLED_CLASSES = withTrait('controlsIndent');
export const SPECIAL_INDENT_CLASSES = withTrait('specialIndent');
export const ALINEA_PROTECTED_CLASSES = withTrait('protectsFromAlinea');
export const TITLE_LIKE_CLASSES = withTrait('titleLike');

/** A classe com que `cls` não pode coexistir, ou undefined. */
export const exclusiveOf = (cls: string): string | undefined =>
    STYLE_TRAITS[cls]?.excludes ?? Object.entries(STYLE_TRAITS).find(([, t]) => t.excludes === cls)?.[0];
