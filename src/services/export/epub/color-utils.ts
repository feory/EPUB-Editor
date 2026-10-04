const INACCESSIBLE_COLORS_TO_REMOVE = [
    '#ff0000', '#ffff00', '#00ff00', '#ff00ff', '#00ffff',
];

const COLORS_TO_REPLACE_WITH_BLACK = [
    '#aaaaaa', '#999999', '#999', '#cccccc', '#c0c0c0',
];

const INACCESSIBLE_NAMED_COLORS = ['red', 'lime', 'yellow', 'magenta', 'fuchsia', 'cyan', 'aqua'];

const CSS_COLOR_PATTERNS: [RegExp, string][] = [
    ...INACCESSIBLE_COLORS_TO_REMOVE.map(color => [
        new RegExp(`(\\bcolor\\s*:\\s*)${color}(?=[\\s;,}])`, 'gi'), '$1#1a1a1a',
    ] as [RegExp, string]),
    ...INACCESSIBLE_NAMED_COLORS.map(name => [
        new RegExp(`(\\bcolor\\s*:\\s*)${name}(?=[\\s;,}])`, 'gi'), '$1#1a1a1a',
    ] as [RegExp, string]),
];

type HtmlColorPatternPair = [RegExp, RegExp];

const HTML_COLOR_REPLACE_PATTERNS: HtmlColorPatternPair[] = COLORS_TO_REPLACE_WITH_BLACK.map(color => {
    const esc = color.replace('#', '\\#');
    return [
        new RegExp(`(<span[^>]*?style=["'][^"']*?)color:\\s*${esc}([^"']*?["'][^>]*?>)`, 'gi'),
        new RegExp(`<span\\s+style=["']color:\\s*${esc}["']>`, 'gi'),
    ];
});

const HTML_COLOR_REMOVE_PATTERNS: HtmlColorPatternPair[] = INACCESSIBLE_COLORS_TO_REMOVE.map(color => {
    const esc = color.replace('#', '\\#');
    return [
        new RegExp(`<span([^>]*?)style=["']([^"']*?)color:\\s*${esc}([^"']*?)["']([^>]*?)>(.*?)<\\/span>`, 'gi'),
        new RegExp(`<span\\s+style=["']color:\\s*${esc}["']>(.*?)<\\/span>`, 'gi'),
    ];
});

export const removeInaccessibleCssColors = (css: string): string => {
    let cleaned = css;
    for (const [pattern, replacement] of CSS_COLOR_PATTERNS) {
        cleaned = cleaned.replace(pattern, replacement);
    }
    return cleaned;
};

export const removeInaccessibleColors = (html: string): string => {
    let cleaned = html;
    for (const [span1, span2] of HTML_COLOR_REPLACE_PATTERNS) {
        cleaned = cleaned.replace(span1, '$1color: #000000$2');
        cleaned = cleaned.replace(span2, '<span style="color: #000000">');
    }
    for (const [span1, span2] of HTML_COLOR_REMOVE_PATTERNS) {
        cleaned = cleaned.replace(span1, '$5');
        cleaned = cleaned.replace(span2, '$1');
    }
    return cleaned.replace(/<span\s*><\/span>/gi, '');
};
