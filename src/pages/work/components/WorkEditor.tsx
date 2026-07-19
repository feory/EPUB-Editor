import React, { useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { Maximize2 } from 'lucide-react';
import { useStyles } from '../../../context/StyleContext';
import { ebooksApi } from '../../../api/ebooks-api';
import { applyImportOptions, convertListsToDialogue } from '../../../utils/html-cleaner';
import type { ImportOptions } from '../../../utils/html-cleaner';
import { fixLinks, validateLinks, type LinkReport } from '../../../services/link-validator';
import { cleanIndexText, INDEX_PAGE_LIST, isPageContinuation } from '../../../utils/index-cleaner';
import { sanitizeImageFilename } from '../../../utils/format';
import {
    getContentBlocks, unwrapNode, clearMarkers,
    clearGrammarErrorsInBody,
} from '../utils/editorDom';
import { runGrammarCheck } from '../utils/grammarCheck';
import { editorFontCss } from '../utils/editorFonts';
import { useBlockOverlays } from '../editor/useBlockOverlays';
import { BlockOverlays } from '../editor/overlays/BlockOverlays';
import { createEditorSetup } from '../editor/setup';
import { buildContentStyle } from '../editor/contentStyles';
import { EDITOR_PLUGINS, EDITOR_TOOLBAR, QUICKBARS_SELECTION_TOOLBAR, STYLE_FORMATS, TEXT_PATTERNS } from '../editor/config';

// TinyMCE local bundle
import 'tinymce/tinymce';
import 'tinymce/themes/silver/theme';
import 'tinymce/icons/default/icons';
import 'tinymce/models/dom/model';
import 'tinymce/plugins/advlist/plugin';
import 'tinymce/plugins/autolink/plugin';
import 'tinymce/plugins/lists/plugin';
import 'tinymce/plugins/link/plugin';
import 'tinymce/plugins/image/plugin';
import 'tinymce/plugins/charmap/plugin';
import 'tinymce/plugins/preview/plugin';
import 'tinymce/plugins/anchor/plugin';
import 'tinymce/plugins/searchreplace/plugin';
import 'tinymce/plugins/visualblocks/plugin';
import 'tinymce/plugins/code/plugin';
import 'tinymce/plugins/fullscreen/plugin';
import 'tinymce/plugins/insertdatetime/plugin';
import 'tinymce/plugins/media/plugin';
import 'tinymce/plugins/table/plugin';
import 'tinymce/plugins/help/plugin';
import 'tinymce/plugins/wordcount/plugin';
import 'tinymce/skins/ui/oxide/skin.css';
import 'tinymce/skins/ui/oxide/content.css';
import type { TinyMCEEditor } from '../editor/types';

interface WorkEditorProps {
    htmlContent: string;
    setHtmlContent: (content: string) => void;
    isDragOver: boolean;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    isbn: string | undefined;
    title?: string;
    activeChapterIndex: number;
    chapters: { title: string, content: string, level: string }[];
    grammarCache?: Record<string, any>;
    onGrammarCheck?: (matches: any[], cache?: Record<string, any>) => void;
    onGrammarClick?: (index: number) => void;
    onSave?: () => void;
    onExport?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onImageUploaded?: () => void;
    onToggleFocusMode?: () => void;
    isFocusMode?: boolean;
    readOnly?: boolean;
    editorFont?: string;
    editorFontSize?: string;
}

export interface WorkEditorRef {
    highlightDiffParagraphs: (indices: number[]) => void;
    highlightDiffContent: (items: import('../../../workers/diff.worker').DiffItem[]) => void;
    clearDiffHighlights: () => void;
    scrollToContent: (text: string, paragraphIndex?: number) => void;
    scrollToImage: (imageId: string) => boolean;
    highlightGrammarErrors: (matches: any[]) => void;
    clearGrammarErrors: () => void;
    filterGrammarHighlights: (filter: 'all' | 'spelling' | 'grammar') => void;
    removeGrammarHighlights: (indices: Set<number>) => void;
    applyGrammarSuggestion: (index: number, suggestion: string) => void;
    getTextBlocks: () => string[];
    highlightSpellErrors: (issues: any[]) => void;
    clearSpellErrors: () => void;
    applySpellSuggestion: (index: number, suggestion: string) => void;
    insertContent: (content: string) => void;
    setContent: (content: string) => void;
    removeImagesById: (imageIds: string[]) => string;
    triggerGrammarCheck: () => void;
    cleanIndexSelection: () => void;
    applyConversions: (options: ImportOptions) => void;
    fixLinkSpacing: () => number;
    getLinkReport: () => LinkReport;
}

const WorkEditorComponent = forwardRef<WorkEditorRef, WorkEditorProps>((
    { htmlContent, setHtmlContent, isDragOver, onDragOver, onDragLeave, onDrop, isbn, title,
        activeChapterIndex, onGrammarCheck, onGrammarClick, onSave, onExport, onUndo, onRedo, grammarCache, onImageUploaded, onToggleFocusMode, isFocusMode, readOnly, editorFont = 'default', editorFontSize = 'default' },
    ref
) => {
    const editorRef = useRef<TinyMCEEditor | null>(null);
    const overlays = useBlockOverlays(editorRef);
    const isCleaningRef = useRef(false);
    const isDiffHighlightingRef = useRef(false);
    const grammarCacheRef = useRef(grammarCache);
    grammarCacheRef.current = grammarCache;
    const onGrammarCheckRef = useRef(onGrammarCheck);
    onGrammarCheckRef.current = onGrammarCheck;
    const onImageUploadedRef = useRef(onImageUploaded);
    onImageUploadedRef.current = onImageUploaded;
    const { getCurrentCss } = useStyles();
    const currentCss = getCurrentCss();


    // Modo leitura (2º utilizador no mesmo projeto) — alterna o editor em runtime
    const readOnlyRef = useRef(readOnly);
    readOnlyRef.current = readOnly;
    useEffect(() => {
        editorRef.current?.mode?.set(readOnly ? 'readonly' : 'design');
    }, [readOnly]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const editorDoc = editor.getDoc();
        if (!editorDoc) return;
        let styleElement = editorDoc.getElementById('custom-editor-styles') as HTMLStyleElement;
        if (!styleElement) {
            styleElement = editorDoc.createElement('style');
            styleElement.id = 'custom-editor-styles';
            editorDoc.head.appendChild(styleElement);
        }
        styleElement.textContent = currentCss +
            editorFontCss(editorFont, editorFontSize);
    }, [currentCss, editorFont, editorFontSize]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        setTimeout(() => {
            const editorWin = editor.getWin();
            if (editorWin) editorWin.scrollTo(0, 0);
            editor.selection.setCursorLocation(editor.getBody().firstChild as any, 0);
        }, 100);
    }, [activeChapterIndex]);

    useImperativeHandle(ref, () => ({
        highlightDiffParagraphs: (indices: number[]) => {
            const editor = editorRef.current;
            if (!editor) return;
            const indexSet = new Set(indices);
            getContentBlocks(editor.getBody()).forEach((block, i) => {
                block.classList.toggle('diff-highlight', indexSet.has(i));
            });
        },

        highlightDiffContent: (items) => {
            const editor = editorRef.current;
            if (!editor) return;
            const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const body = editor.getBody();
            isDiffHighlightingRef.current = true;

            try {
                // Save cursor block index before DOM changes
                const rng = editor.selection.getRng();
                const anchorEl = (rng.startContainer.nodeType === 3
                    ? rng.startContainer.parentElement
                    : rng.startContainer as HTMLElement);
                const cursorBlock = anchorEl?.closest?.('p,h1,h2,h3') as HTMLElement | null;
                const allBlocksBefore = getContentBlocks(body);
                const cursorIdx = cursorBlock ? allBlocksBefore.indexOf(cursorBlock) : -1;

                // Unwrap any existing diff spans
                body.querySelectorAll('span.diff-char-add, span.diff-char-del').forEach((span: Element) => {
                    span.replaceWith(document.createTextNode(span.textContent ?? ''));
                });
                body.querySelectorAll('.diff-highlight, .diff-modify').forEach((el: Element) =>
                    el.classList.remove('diff-highlight', 'diff-modify'));

                const blocks = getContentBlocks(body);
                let cursorBlockHasAdds = false;
                let cursorBlockInnerHTMLReplaced = false;

                for (const item of items) {
                    if (item.editorIndex == null) continue;
                    const block = blocks[item.editorIndex] as HTMLElement | undefined;
                    if (!block) continue;

                    if (item.type === 'insert') {
                        block.classList.add('diff-highlight');
                    } else if (item.type === 'modify' && item.charDiff) {
                        // Guard: any element children means inline markup — use class-only fallback
                        if (block.children.length > 0) {
                            block.classList.add('diff-highlight');
                        } else {
                            // 'delete' parts are reference-only — never inject into editor DOM
                            block.innerHTML = item.charDiff.map(p => {
                                const t = escHtml(p.text);
                                if (p.type === 'insert') return `<span class="diff-char-add">${t}</span>`;
                                if (p.type === 'delete') return '';
                                return t;
                            }).join('');
                            block.classList.add('diff-modify');

                            if (item.editorIndex === cursorIdx) {
                                cursorBlockInnerHTMLReplaced = true;
                                cursorBlockHasAdds = item.charDiff.some(p => p.type === 'insert');
                            }
                        }
                    }
                }

                // Restore cursor: manual placement when innerHTML was replaced (bookmark would be stale)
                if (cursorBlockInnerHTMLReplaced && cursorIdx >= 0) {
                    const target = blocks[cursorIdx] as HTMLElement | undefined;
                    if (target) {
                        try {
                            const doc = editor.getDoc();
                            const range = doc.createRange();
                            if (cursorBlockHasAdds) {
                                // After last added span
                                const addSpans = target.querySelectorAll('span.diff-char-add');
                                const last = addSpans[addSpans.length - 1];
                                if (last) {
                                    range.setStartAfter(last);
                                } else {
                                    range.selectNodeContents(target);
                                    range.collapse(false);
                                }
                            } else {
                                // At first child (chars were removed)
                                range.setStart(target, 0);
                            }
                            range.collapse(true);
                            editor.selection.setRng(range);
                        } catch { /* ignore */ }
                    }
                }
            } finally {
                isDiffHighlightingRef.current = false;
            }
        },

        clearDiffHighlights: () => {
            const editor = editorRef.current;
            if (!editor) return;
            const body = editor.getBody();
            isDiffHighlightingRef.current = true;

            // Save cursor as (blockIdx, charOffset) — survives DOM restructuring
            let savedBlockIdx = -1, savedCharOffset = 0;
            try {
                const rng = editor.selection.getRng();
                const anchor = rng.startContainer.nodeType === 3
                    ? (rng.startContainer as Text).parentElement
                    : rng.startContainer as HTMLElement;
                const blk = anchor?.closest?.('p,h1,h2,h3') as HTMLElement | null;
                if (blk) {
                    savedBlockIdx = getContentBlocks(body).indexOf(blk);
                    const tw = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
                    let n: Node | null; let acc = 0;
                    while ((n = tw.nextNode())) {
                        if (n === rng.startContainer) { savedCharOffset = acc + rng.startOffset; break; }
                        acc += (n.textContent ?? '').length;
                    }
                }
            } catch { /* no cursor */ }

            // Unwrap diff spans — text preserved, wrappers removed
            body.querySelectorAll('span.diff-char-add, span.diff-char-del').forEach((span: Element) =>
                span.replaceWith(document.createTextNode(span.textContent ?? '')));
            body.querySelectorAll('.diff-highlight, .diff-modify').forEach((el: Element) =>
                el.classList.remove('diff-highlight', 'diff-modify'));
            body.normalize();

            // Restore cursor by char offset
            if (savedBlockIdx >= 0) {
                try {
                    const blk = getContentBlocks(body)[savedBlockIdx];
                    if (blk) {
                        const doc = editor.getDoc();
                        const rng = doc.createRange();
                        const tw = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
                        let n: Node | null; let rem = savedCharOffset;
                        while ((n = tw.nextNode())) {
                            const len = (n.textContent ?? '').length;
                            if (rem <= len) { rng.setStart(n, rem); rng.collapse(true); editor.selection.setRng(rng); break; }
                            rem -= len;
                        }
                    }
                } catch { /* ignore */ }
            }

            isDiffHighlightingRef.current = false;
        },

        clearGrammarErrors: () => {
            const editor = editorRef.current;
            if (!editor) return;
            clearGrammarErrorsInBody(editor.getBody());
        },

        cleanIndexSelection: () => {
            const editor = editorRef.current;
            if (!editor) return;
            // Sem seleção → limpa o capítulo inteiro (body do editor).
            const selected = editor.selection.getContent({ format: 'html' });
            const useSelection = !!selected.trim();
            const html = useSelection ? selected : editor.getContent();
            if (!html.trim()) return;

            const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const toParas = (text: string, cls: string) => {
                const attr = cls ? ` class="${esc(cls)}"` : '';
                return cleanIndexText(text).map(e => `<p${attr}>${esc(e)}</p>`);
            };

            const doc = new DOMParser().parseFromString(html, 'text/html');
            // Remove só os números de página dos text nodes, PRESERVANDO a formatação
            // (<em>/<strong>/versaletes/notas). Apara separadores finais no último text node.
            const stripPageNumbers = (el: Element) => {
                const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
                const texts: Text[] = [];
                for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
                for (const t of texts) t.textContent = (t.textContent || '').replace(INDEX_PAGE_LIST, '');
                for (let i = texts.length - 1; i >= 0; i--) {
                    const s = texts[i].textContent || '';
                    if (s.trim()) { texts[i].textContent = s.replace(/[\s,;.]+$/, ''); break; }
                    texts[i].textContent = '';
                }
            };

            const blocks = Array.from(doc.body.children);
            const out: string[] = [];
            if (blocks.length === 0) {
                // Sem blocos (texto solto): limpa tudo
                out.push(...toParas(doc.body.textContent ?? '', ''));
            } else {
                // Preserva títulos <h1>-<h6> (o índice é normalmente um capítulo);
                // limpa só os parágrafos entre eles, mantendo classe E formatação inline.
                for (const block of blocks) {
                    // Preservar títulos e marcadores de capítulo (fronteira do capítulo) intactos.
                    if (/^H[1-6]$/.test(block.tagName) || /\bchapter-break/.test(block.className)) { out.push(block.outerHTML); continue; }
                    const text = block.textContent ?? '';
                    if (!text.trim()) continue;
                    if (isPageContinuation(text)) continue; // linha só de páginas → descartar
                    stripPageNumbers(block);
                    if ((block.textContent ?? '').trim()) out.push(block.outerHTML);
                }
            }
            if (out.length === 0) return;
            if (useSelection) editor.selection.setContent(out.join(''));
            else editor.setContent(out.join(''));
            editor.dispatch('Change');
        },

        applyConversions: (options: ImportOptions) => {
            const editor = editorRef.current;
            if (!editor) return;
            const html = editor.getContent();
            if (!html.trim()) return;
            let result = applyImportOptions(html, options);
            if (options.convertListsToDialogue) result = convertListsToDialogue(result);
            if (result === html) return;
            editor.setContent(result);
            editor.dispatch('Change');
        },

        fixLinkSpacing: () => {
            const editor = editorRef.current;
            if (!editor) return 0;
            const html = editor.getContent();
            if (!html.trim()) return 0;
            const { html: fixedHtml, fixed } = fixLinks(html);
            if (fixed > 0 && fixedHtml !== html) {
                editor.setContent(fixedHtml);
                editor.dispatch('Change');
            }
            return fixed;
        },

        getLinkReport: () => {
            const editor = editorRef.current;
            return validateLinks(editor ? editor.getContent() : '');
        },

        filterGrammarHighlights: (filter: 'all' | 'spelling' | 'grammar') => {
            const editor = editorRef.current;
            if (!editor) return;
            const spans = editor.getBody().querySelectorAll('.grammar-error-highlight');
            spans.forEach((span: HTMLElement) => {
                const type = span.getAttribute('data-issue-type');
                const hidden = (filter === 'spelling' && type !== 'spelling') ||
                               (filter === 'grammar'  && type !== 'grammar');
                span.style.textDecoration = hidden ? 'none' : '';
                span.style.cursor = hidden ? 'default' : 'pointer';
                span.style.background = hidden ? 'none' : '';
            });
        },

        highlightGrammarErrors: (matches: any[]) => {
            const editor = editorRef.current;
            if (!editor || matches.length === 0) return;

            const body = editor.getBody();
            clearGrammarErrorsInBody(body);
            const blocks = getContentBlocks(body);

            matches.forEach((match, originalIndex) => {
                if (!match.context || match.paragraphIndex === undefined) return;
                const targetBlock = blocks[match.paragraphIndex];
                if (!targetBlock) return;

                const errorText = match.context.text.substring(
                    match.context.offset,
                    match.context.offset + match.context.length
                );
                if (!errorText || errorText.length < 2) return;

                const walker = document.createTreeWalker(targetBlock, NodeFilter.SHOW_TEXT, null);
                let textNode;
                while ((textNode = walker.nextNode())) {
                    const content = textNode.textContent || '';
                    const index = content.indexOf(errorText);
                    if (index !== -1) {
                        const range = document.createRange();
                        range.setStart(textNode, index);
                        range.setEnd(textNode, index + errorText.length);
                        const span = document.createElement('span');
                        span.className = 'grammar-error-highlight';
                        span.title = match.message;
                        span.setAttribute('data-error-index', originalIndex.toString());
                        span.setAttribute('data-issue-type', match.rule?.issueType === 'misspelling' ? 'spelling' : 'grammar');
                        try {
                            range.surroundContents(span);
                        } catch (e) {
                            console.warn('Could not surround grammar error in block:', errorText);
                        }
                        break;
                    }
                }
            });
        },

        removeGrammarHighlights: (indices: Set<number>) => {
            const editor = editorRef.current;
            if (!editor) return;
            const body = editor.getBody();
            indices.forEach(index => {
                const span = body.querySelector(`.grammar-error-highlight[data-error-index="${index}"]`);
                if (span?.parentNode) {
                    const parent = span.parentNode;
                    unwrapNode(span);
                    parent.normalize();
                }
            });
            // Renumber remaining spans so indices stay in sync with grammarIssues array
            const sortedRemoved = [...indices].sort((a, b) => a - b);
            body.querySelectorAll('.grammar-error-highlight[data-error-index]').forEach((span: Element) => {
                const idx = parseInt(span.getAttribute('data-error-index') || '0', 10);
                let lo = 0, hi = sortedRemoved.length;
                while (lo < hi) { const mid = (lo + hi) >>> 1; if (sortedRemoved[mid] < idx) lo = mid + 1; else hi = mid; }
                if (lo > 0) span.setAttribute('data-error-index', (idx - lo).toString());
            });
        },

        applyGrammarSuggestion: (index: number, suggestion: string) => {
            const editor = editorRef.current;
            if (!editor) return;
            const body = editor.getBody();
            const marker = body.querySelector(`.grammar-error-highlight[data-error-index="${index}"]`);
            if (marker?.parentNode) {
                marker.textContent = suggestion;
                unwrapNode(marker);
                editor.dispatch('change');
                body.normalize();
            }
        },

        getTextBlocks: () => {
            const editor = editorRef.current;
            if (!editor) return [];
            return getContentBlocks(editor.getBody()).map(el => (el.textContent || '').trim());
        },

        highlightSpellErrors: (issues: any[]) => {
            const editor = editorRef.current;
            if (!editor || issues.length === 0) return;
            const body = editor.getBody();
            clearMarkers(body, 'spell-error-highlight');
            const blocks = getContentBlocks(body);

            issues.forEach((issue, idx) => {
                const block = blocks[issue.paragraphIndex];
                if (!block) return;
                const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
                let node;
                while ((node = walker.nextNode())) {
                    const content = node.textContent || '';
                    const pos = content.indexOf(issue.word);
                    if (pos !== -1) {
                        const range = document.createRange();
                        range.setStart(node, pos);
                        range.setEnd(node, pos + issue.word.length);
                        const span = document.createElement('span');
                        span.className = 'spell-error-highlight';
                        span.title = issue.message;
                        span.setAttribute('data-spell-index', idx.toString());
                        try { range.surroundContents(span); } catch { /* overlapping range */ }
                        break;
                    }
                }
            });
        },

        clearSpellErrors: () => {
            const editor = editorRef.current;
            if (!editor) return;
            clearMarkers(editor.getBody(), 'spell-error-highlight');
        },

        applySpellSuggestion: (index: number, suggestion: string) => {
            const editor = editorRef.current;
            if (!editor) return;
            const body = editor.getBody();
            const marker = body.querySelector(`.spell-error-highlight[data-spell-index="${index}"]`);
            if (marker) {
                marker.textContent = suggestion;
                const parent = marker.parentNode;
                if (parent) {
                    while (marker.firstChild) parent.insertBefore(marker.firstChild, marker);
                    parent.removeChild(marker);
                }
                editor.dispatch('change');
                body.normalize();
            }
        },

        scrollToContent: (searchText: string, paragraphIndex?: number) => {
            const editor = editorRef.current;
            if (!editor) return;
            const body = editor.getBody();
            if (!body) return;

            editor.focus();

            const blocks = getContentBlocks(body);
            const targetBlock = (paragraphIndex !== undefined && blocks[paragraphIndex])
                ? blocks[paragraphIndex]
                : body;

            const cleanSearch = searchText
                .replace(/^\.{3}/, '').replace(/\.{3}$/, '')
                .replace(/&[a-zA-Z]+;/g, ' ')
                .trim();

            if (!cleanSearch) {
                if (paragraphIndex !== undefined && blocks[paragraphIndex]) {
                    blocks[paragraphIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }

            const walker = document.createTreeWalker(targetBlock, NodeFilter.SHOW_TEXT, null);
            let node;
            let found = false;
            const searchSnippet = cleanSearch.substring(0, Math.min(30, cleanSearch.length));

            while ((node = walker.nextNode())) {
                const nodeText = node.textContent || '';
                if (nodeText.includes(searchSnippet)) {
                    const parent = (node as Text).parentElement;
                    if (parent) {
                        parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        parent.classList.add('highlight-pulse');
                        setTimeout(() => parent.classList.remove('highlight-pulse'), 3000);
                        editor.selection.select(parent);
                        found = true;
                        break;
                    }
                }
            }

            if (!found && paragraphIndex !== undefined && blocks[paragraphIndex]) {
                blocks[paragraphIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
                blocks[paragraphIndex].classList.add('highlight-pulse');
                setTimeout(() => blocks[paragraphIndex].classList.remove('highlight-pulse'), 3000);
            }
        },

        scrollToImage: (imageId: string) => {
            const editor = editorRef.current;
            if (!editor) return false;
            // ponytail: só procura no capítulo aberto; localizar noutro capítulo
            // exigia mapear data-image-id → índice de capítulo no html completo.
            const img = editor.getBody()?.querySelector(`img[data-image-id="${imageId}"]`) as HTMLElement | null;
            if (!img) return false;
            editor.focus();
            img.scrollIntoView({ behavior: 'smooth', block: 'center' });
            img.classList.add('highlight-pulse');
            setTimeout(() => img.classList.remove('highlight-pulse'), 3000);
            editor.selection.select(img);
            return true;
        },

        insertContent: (content: string) => {
            const editor = editorRef.current;
            if (!editor) return;
            editor.insertContent(content);
        },

        setContent: (content: string) => {
            const editor = editorRef.current;
            if (!editor) return;
            editor.setContent(content);
        },

        triggerGrammarCheck: () => {
            const editor = editorRef.current;
            if (!editor) return;
            runGrammarCheck(
                editor.getBody(),
                grammarCacheRef.current,
                onGrammarCheckRef.current,
                (on) => editor.setProgressState(on)
            );
        },

        removeImagesById: (imageIds: string[]): string => {
            const editor = editorRef.current;
            if (!editor) return '';
            const ids = new Set(imageIds);
            editor.getBody().querySelectorAll('img').forEach((img: HTMLImageElement) => {
                const id = img.getAttribute('data-image-id');
                const src = img.getAttribute('src') || '';
                if ((id && ids.has(id)) || [...ids].some(i => src.includes(`/images/${i}`))) {
                    img.remove();
                }
            });
            editor.dispatch('change');
            return editor.getContent();
        },
    }));

    return (
        <div
            className={`bg-surface rounded-2xl shadow-xl shadow-slate-200/50 border border-border overflow-hidden animate-in fade-in duration-500 ${isDragOver ? 'ring-2 ring-primary ring-offset-2 bg-blue-50/50' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {!isFocusMode && (
                <div className="px-6 py-4 min-h-[64px] border-b border-border bg-slate-50/50 flex items-center justify-end gap-3">
                    <span className="text-xs font-medium text-text-muted truncate max-w-[500px]">
                        {isbn}{title ? ` - ${title}` : ''}
                    </span>
                    <button
                        onClick={() => onToggleFocusMode?.()}
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-slate-800 transition-colors shrink-0"
                        title="Modo Foco"
                    >
                        <Maximize2 size={16} />
                    </button>
                </div>
            )}

            <div className="relative">
                <Editor
                    licenseKey="gpl"
                    onInit={(_evt, editor) => { editorRef.current = editor; if (readOnlyRef.current) editor.mode.set('readonly'); }}
                    value={htmlContent}
                    onEditorChange={(content) => { if (!isDiffHighlightingRef.current) setHtmlContent(content); }}
                    init={{
                        height: 700,
                        menubar: false,
                        elementpath: false,
                        base_url: '/tinymce',
                        skin: false,
                        content_css: false,
                        // preservar o marcador de quebra de página (span vazio com classe/dados)
                        extended_valid_elements: 'span[class|data-page|id|style]',
                        plugins: EDITOR_PLUGINS,
                        // Bubble de formatação na seleção de texto (só selection; sem barras de inserção/imagem).
                        quickbars_insert_toolbar: false,
                        quickbars_image_toolbar: false,
                        quickbars_selection_toolbar: QUICKBARS_SELECTION_TOOLBAR,
                        toolbar_mode: 'wrap',
                        toolbar: EDITOR_TOOLBAR,
                        setup: createEditorSetup({
                            setHtmlContent, isCleaningRef, onGrammarClick, onSave, onExport, onUndo, onRedo,
                            startHtmlEdit: overlays.startHtmlEdit,
                            openStyleMenu: overlays.openStyleMenu,
                            wireOverlays: overlays.wireEditor,
                        }),
                        automatic_uploads: true,
                        paste_data_images: true,
                        file_picker_types: 'image',
                        file_picker_callback: (callback: (value: string, meta?: Record<string, any>) => void) => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = 'image/*';
                            input.onchange = () => {
                                const file = input.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                    const dataUrl = reader.result as string;
                                    const base64 = dataUrl.split(',')[1];
                                    const editor = editorRef.current;
                                    if (!editor) return;
                                    const blobCache = editor.editorUpload.blobCache;
                                    const blobId = `blobid${Date.now()}`;
                                    const blobInfo = blobCache.create(blobId, file, base64, file.name);
                                    blobCache.add(blobInfo);
                                    callback(blobInfo.blobUri(), { title: file.name });
                                };
                                reader.readAsDataURL(file);
                            };
                            input.click();
                        },
                        images_upload_handler: async (blobInfo: any, _progress: any) => {
                            const { filename, imageId } = sanitizeImageFilename(blobInfo.filename() || 'image.png');
                            const formData = new FormData();
                            formData.append('images', blobInfo.blob(), filename);
                            if (!isbn) throw new Error('ISBN não disponível');
                            await ebooksApi.uploadImages(isbn, formData);
                            onImageUploadedRef.current?.();
                            return `/api/ebooks/${isbn}/images/${imageId}`;
                        },
                        content_style: buildContentStyle(currentCss),
                        style_formats: STYLE_FORMATS,
                        text_patterns: TEXT_PATTERNS,
                        browser_spellcheck: true,
                        branding: false,
                        statusbar: true,
                        promotion: false,
                        resize: true,
                    }}
                />
                <BlockOverlays {...overlays} readOnly={readOnly} />
            </div>
        </div>
    );
});

export const WorkEditor = React.memo(WorkEditorComponent);
