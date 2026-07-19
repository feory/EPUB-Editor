import type { TinyMCEEditor } from './types';

// Ícones SVG custom para os botões do mini-menu/toolbar (substituem labels de texto).
// 24x24, currentColor — letras via <text>, estruturas via <path>.
export function registerEditorIcons(editor: TinyMCEEditor) {
    const txtIcon = (label: string, size = 11) =>
        `<svg width="24" height="24" viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="${size}" fill="currentColor">${label}</text></svg>`;
    ([
        ['ps-default', '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4 5h16v2H4zm0 4h16v2H4zm0 4h16v2H4zm0 4h10v2H4z"/></svg>'],
        ['ps-indent', '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M9 5h11v2H9zM4 9h16v2H4zm0 4h16v2H4zm0 4h16v2H4z"/></svg>'],
        ['ps-top', '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M3 3h18v2H3z"/><path fill="currentColor" d="M12 7l4 5h-3v4h-2v-4H8z"/><path fill="currentColor" d="M4 19h16v2H4z"/></svg>'],
        ['ps-space', '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4 3h16v3H4zm0 15h16v3H4z"/><path fill="currentColor" opacity=".45" d="M11 8h2v8h-2z"/></svg>'],
        ['ps-small', '<svg width="24" height="24" viewBox="0 0 24 24"><text x="12" y="18" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="14" fill="currentColor">a</text></svg>'],
        ['ps-bold', '<svg width="24" height="24" viewBox="0 0 24 24"><text x="12" y="18" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="16" fill="currentColor">B</text></svg>'],
        ['ps-quote', '<svg width="24" height="24" viewBox="0 0 24 24"><rect x="3" y="4" width="3" height="16" rx="1.5" fill="currentColor"/><path fill="currentColor" d="M9 7h11v2H9zm0 4h11v2H9zm0 4h8v2H9z"/></svg>'],
        ['ps-h1', txtIcon('H1')],
        ['ps-h2', txtIcon('H2')],
        ['ps-h3', txtIcon('H3')],
        ['ps-smalltext', '<svg width="24" height="24" viewBox="0 0 24 24"><text x="6" y="18" font-family="serif" font-weight="bold" font-size="15" fill="currentColor">A</text><text x="15" y="18" font-family="serif" font-weight="bold" font-size="9" fill="currentColor">a</text></svg>'],
        ['ps-smallcaps', '<svg width="24" height="24" viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-family="serif" font-weight="bold" font-size="13" fill="currentColor">A<tspan font-size="9">A</tspan></text></svg>'],
        ['ps-box', '<svg width="24" height="24" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" fill="none" stroke="currentColor" stroke-width="2"/></svg>'],
        ['ps-union', '<svg width="24" height="24" viewBox="0 0 24 24"><rect x="4" y="4" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg>'],
        ['ps-htmledit', '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M9 8l-4 4 4 4m6-8l4 4-4 4"/></svg>'],
        ['ps-vdots', '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>'],
        ['ps-chapterbreak', '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v1.6H4zM4 7.4h11v1.6H4z"/><path fill="currentColor" d="M3 11.4h4v1.6H3zm6 0h4v1.6H9zm6 0h6v1.6h-6z"/><path fill="currentColor" d="M4 15.8h16v1.6H4zM4 19.2h11v1.6H4z"/></svg>'],
    ] as const).forEach(([name, svg]) => editor.ui.registry.addIcon(name, svg));
}
