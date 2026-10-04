// Os três comandos do skill, sem disco nem consola: dados entram, dados saem.
//   analyzeBook(bytes, { baseStyles })              → { map, bodySize, alreadyOptimized, lineBreaks }
//   convertBook(bytes, map, editorCss)              → { bytes, report }
//   verifyBook(originalBytes, optimizedBytes)       → VerifyReport
//   optimizeBook(bytes, map, editorCss, opts?)      → convert + verify + política: { bytes, report, verify, problems, warnings }
// Adapters: a importação InDesign da app (HomePage) e a CLI do skill (.claude/skills/epub-indesign/optimize.ts).
// Os testes (tests/commands.test.ts) usam EPUBs mínimos construídos em memória.
import JSZip from 'jszip';
import { openBook, serialize, type Resolve } from './book';
import { indesignTitle } from './titles';
import { chapterTitleOf } from '../../utils/chapter-title';
import { editorVocabulary } from './editor';
import { intentOf, isBold, isItalic, preservedOf, translateParagraph, translateSpan, type Props } from './translate';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const EPUB_NS = 'http://www.idpf.org/2007/ops';
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
type MapEntry = { target: string; origem?: string; count?: number; sample?: string; css?: string };
export type BookMap = { classes: Record<string, MapEntry> };

// só valores em `em` (ex. 1.5em); % e px de overrides do InDesign não contam como corpo de título
const em = (v?: string) => {
    const m = v?.match(/^(-?[\d.]+)(em)?$/);
    return m ? parseFloat(m[1]) : 0;
};

// Semântica sugerida (as classes do editor saem do CSS no convert; aqui só títulos/legendas/spans).
// ponytail: limiares simples; o mapa revisto e estilos-base.json é que mandam.
function suggest(tag: string, cls: string, p: Props, base: number): string {
    if (tag === 'span') {
        const out: string[] = [];
        if (isBold(p)) out.push('b');
        if (isItalic(p)) out.push('i');
        if (/underline/.test(p['text-decoration'] ?? '')) out.push('u');
        if (/super/.test(p['vertical-align'] ?? '')) out.push('sup');
        else if (/sub/.test(p['vertical-align'] ?? '')) out.push('sub');
        if (/small-caps/.test(p['font-variant'] ?? '')) out.push('small-caps');
        return out.join(' ');
    }
    if (/legenda/i.test(cls)) return 'p-legendas';
    const size = (em(p['font-size']) || base) / base;
    if (size >= 1.6) return 'h1';
    // subtítulo dentro do capítulo → h3 (h2 viraria capítulo no editor)
    if (size >= 1.1 || /t-?tulo|titulo|^subs?[-_\d]|^sub\d/i.test(cls)) return 'h3';
    return '';
}

const RELEVANT = ['font-size', 'font-weight', 'font-style', 'font-variant', 'text-align', 'text-indent',
    'margin-left', 'margin-top', 'margin-bottom', 'text-transform', 'vertical-align', 'color'];
const cssSummary = (p: Props) => RELEVANT.filter(k => p[k] && !/^(normal|none|0|#000000)$/.test(p[k]))
    .map(k => `${k}:${p[k]}`).join('; ');

// ---------- analyze ----------
// baseStyles = estilos-base.json (regras da casa), antes da heurística do CSS. O que o livro precisar a mais
// decide-se no modal da importação (não é guardado: cada livro é importado uma vez).
// EPUB já no formato da app (ex. já optimizado): o CSS do próprio EPUB é o do editor e todas as classes do
// texto existem nele. Não há nada a traduzir — e traduzir de novo estragava os títulos (h1/h3 já não têm o
// estilo do InDesign de onde a regra os deduz), por isso o convert devolve o EPUB tal e qual.
function isAlreadyOptimized(book: Awaited<ReturnType<typeof openBook>>) {
    const vocabulary = editorVocabulary(book.css);
    if (!vocabulary.has('p-indent')) return false; // CSS não é o do editor
    return book.documents.every(({ doc }) => Array.from(doc.querySelectorAll('body [class]'))
        .every(el => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).every(c => vocabulary.has(c))));
}

export async function analyzeBook(bytes: Uint8Array, opts: { baseStyles: Record<string, string> }) {
    const book = await openBook(bytes);
    const { documents, resolve, bodySize: base } = book;
    const baseLookup = new Map(Object.entries(opts.baseStyles).map(([k, v]) => [k.toLowerCase(), v]));

    const found = new Map<string, { count: number; sample: string }>();
    for (const { doc } of documents) {
        for (const el of Array.from(doc.querySelectorAll('p[class], span[class]'))) {
            for (const t of el.getAttribute('class')!.split(/\s+/).filter(Boolean)) {
                const key = `${el.localName}.${t}`;
                const e = found.get(key) ?? { count: 0, sample: '' };
                e.count++;
                if (!e.sample) e.sample = (el.textContent ?? '').trim().slice(0, 70);
                found.set(key, e);
            }
        }
    }

    const classes: Record<string, MapEntry> = {};
    for (const [key, { count, sample }] of [...found].sort((a, b) => b[1].count - a[1].count)) {
        const [tag, cls] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
        const p = resolve(tag, [cls]);
        const fromBase = baseLookup.get(key.toLowerCase());
        classes[key] = {
            target: fromBase ?? suggest(tag, cls, p, base),
            origem: fromBase !== undefined ? 'base' : 'css',
            count, sample, css: cssSummary(p),
        };
    }
    // <br/> do paginador, por tipo (contagem + 1.º exemplo) — para PERGUNTAR antes de juntar
    const isHeading = (p: Element) => (p.getAttribute('class') ?? '').split(/\s+/)
        .some(c => /(^|\s)h[1-6](\s|$)/.test(classes[`p.${c}`]?.target ?? ''));
    const breaks = new Map<LineBreakKind, LineBreakSummary>();
    for (const { doc } of documents) {
        for (const { a, b, kind } of lineBreaksIn(doc.querySelector('body')!, isHeading)) {
            const e = breaks.get(kind);
            if (e) { e.count++; continue; }
            const [left, right] = [a.slice(-30), b.slice(0, 25)];
            const { glue, rest } = joinParts(right, kind);
            const { type, action } = LINE_BREAK_LABELS[kind];
            breaks.set(kind, { kind, type, action, count: 1, left, right, glue, rest,
                label: `${type.toLowerCase()} → ${action}`, before: `…${left}⏎${right}…`, after: `…${left}${glue}${rest}…` });
        }
    }
    const lineBreaks = [...breaks.values()].sort((p, q) => q.count - p.count);
    return { map: { classes } as BookMap, bodySize: base, alreadyOptimized: isAlreadyOptimized(book), lineBreaks };
}

// ---------- convert ----------
// Quebras de linha forçadas do paginador (<br/> a meio de parágrafos e notas; títulos como "I<br/>TÍTULO" nunca).
// Regra para todos os livros, mas SÓ aplicada se o utilizador aceitar: o analyze conta os casos por tipo (com um
// exemplo de cada) para a pergunta — modal da app ou skill — e o convert junta-os com joinLineBreaks: true.
export type LineBreakKind = 'meio-da-frase' | 'fim-da-frase' | 'hifen-repetido' | 'barra-repetida' | 'hifen-no-fim' | 'pontas';
export const LINE_BREAK_LABELS: Record<LineBreakKind, { type: string; action: string }> = {
    'meio-da-frase': { type: 'A meio da frase', action: 'passa a espaço' },
    'fim-da-frase': { type: 'Depois do fim da frase', action: 'passa a espaço' },
    'hifen-repetido': { type: 'Hífen repetido na linha seguinte', action: 'fica um hífen' },
    'barra-repetida': { type: 'Barra repetida na linha seguinte', action: 'fica uma barra' },
    'hifen-no-fim': { type: 'Hífen no fim da linha', action: 'junta, mantém o hífen' },
    'pontas': { type: 'No início ou fim do parágrafo', action: 'sai' },
};
// Exemplo em partes para a UI realçar a junção: antes = left ⏎ right; depois = left + glue + rest.
// label/before/after = o mesmo em texto (CLI).
export type LineBreakSummary = {
    kind: LineBreakKind; type: string; action: string; count: number;
    left: string; right: string; glue: string; rest: string;
    label: string; before: string; after: string;
};

function breakKind(a: string, b: string): LineBreakKind {
    if (!a || !b) return 'pontas';
    if (a.endsWith('-') && b.startsWith('-')) return 'hifen-repetido';
    if (a.endsWith('/') && b.startsWith('/')) return 'barra-repetida';
    if (a.endsWith('-')) return 'hifen-no-fim';
    return /[.!?…»”)]$/.test(a) ? 'fim-da-frase' : 'meio-da-frase';
}
// o que fica entre as duas linhas (glue) e o resto da 2.ª linha depois de juntar
const joinParts = (b: string, kind: LineBreakKind) =>
    kind === 'hifen-repetido' || kind === 'barra-repetida' ? { glue: '', rest: b.slice(1) }
        : kind === 'hifen-no-fim' || kind === 'pontas' ? { glue: '', rest: b } : { glue: ' ', rest: b };

// texto vizinho do <br> dentro do parágrafo (desce pelos spans/sup)
function edgeText(node: Node | null, last: boolean): Text | null {
    if (!node) return null;
    if (node.nodeType === 3) return node as Text;
    const kids = Array.from(node.childNodes);
    for (const k of last ? kids.reverse() : kids) { const t = edgeText(k, last); if (t) return t; }
    return null;
}
function besideBr(br: Element, before: boolean): Text | null {
    for (let n: Node | null = br; n && n.nodeName.toLowerCase() !== 'p'; n = n.parentNode) {
        for (let s = before ? n.previousSibling : n.nextSibling; s; s = before ? s.previousSibling : s.nextSibling) {
            const t = edgeText(s, before);
            if (t) return t;
        }
    }
    return null;
}
// <br> dentro de <p> (texto e notas); `skip` = parágrafos que vão ser títulos (no original ainda são <p>)
function breakAt(br: Element) {
    const prev = besideBr(br, true), next = besideBr(br, false);
    const a = prev?.data.trimEnd() ?? '', b = next?.data.trimStart() ?? '';
    return { br, prev, next, a, b, kind: breakKind(a, b) };
}
const lineBreaksIn = (body: Element, skip: (p: Element) => boolean = () => false) =>
    Array.from(body.querySelectorAll('p br')).filter(br => !skip(br.closest('p')!)).map(breakAt);
// "a<br/>b" → "a b"; "não-<br/>-instr." → "não-instr."; "a/<br/>/b" → "a/b"; "pseudo-<br/>prof." → "pseudo-prof."
function joinLineBreaks(body: Element) {
    // um a um, lido na hora: o texto entre dois <br> muda quando o 1.º é juntado
    for (const el of Array.from(body.querySelectorAll('p br'))) {
        const { br, prev, next, a, b, kind } = breakAt(el);
        if (kind === 'meio-da-frase' || kind === 'fim-da-frase') {
            if (/\s$/.test(prev!.data) || /^\s/.test(next!.data)) br.remove(); // já há espaço
            else br.replaceWith(br.ownerDocument.createTextNode(' '));
        } else {
            if (prev) prev.data = a;
            if (next) next.data = kind === 'hifen-repetido' || kind === 'barra-repetida' ? b.slice(1) : b;
            br.remove();
        }
    }
}
function moveChildren(from: Element, to: Node) {
    while (from.firstChild) to.appendChild(from.firstChild);
}
function unwrap(el: Element) {
    while (el.firstChild) el.parentNode!.insertBefore(el.firstChild, el);
    el.remove();
}
function rename(el: Element, tag: string): Element {
    const n = el.ownerDocument.createElementNS(XHTML_NS, tag);
    for (const a of Array.from(el.attributes)) n.setAttribute(a.name, a.value);
    moveChildren(el, n);
    el.replaceWith(n);
    return n;
}

// Notas InDesign (a._idFootnoteLink + section._idFootnotes > li) → modelo da app:
// sup>a[noteref] no corpo; div.footnotes-section > aside.footnote no fim (o importador lê ambos).
function convertFootnotes(doc: Document, body: Element): number {
    const swap = (old: Element, attrs: Record<string, string>) => {
        const a = doc.createElementNS(XHTML_NS, 'a');
        if (old.getAttribute('id')) a.setAttribute('id', old.getAttribute('id')!);
        a.setAttribute('href', old.getAttribute('href') ?? '');
        for (const [k, v] of Object.entries(attrs)) {
            if (k === 'epub:type') a.setAttributeNS(EPUB_NS, k, v); else a.setAttribute(k, v);
        }
        moveChildren(old, a);
        old.replaceWith(a);
    };
    body.querySelectorAll('a._idFootnoteLink').forEach(a => swap(a, { 'epub:type': 'noteref', role: 'doc-noteref' }));
    let notes = 0;
    for (const section of Array.from(body.querySelectorAll('section._idFootnotes'))) {
        const wrap = doc.createElementNS(XHTML_NS, 'div');
        wrap.setAttribute('class', 'footnotes-section');
        for (const li of Array.from(section.querySelectorAll('li._idFootnote'))) {
            li.querySelectorAll('a._idFootnoteAnchor').forEach(a => swap(a, { role: 'doc-backlink' }));
            const aside = doc.createElementNS(XHTML_NS, 'aside');
            aside.setAttribute('id', li.getAttribute('id') ?? '');
            aside.setAttributeNS(EPUB_NS, 'epub:type', 'footnote');
            aside.setAttribute('role', 'doc-footnote');
            aside.setAttribute('class', 'footnote');
            for (const node of Array.from(li.childNodes)) if (node.nodeType === 1) aside.appendChild(node);
            wrap.appendChild(aside);
            notes++;
        }
        section.replaceWith(wrap);
    }
    return notes;
}

function convertBody(doc: Document, map: BookMap, resolve: Resolve, base: number, front: boolean, vocabulary: Set<string>,
    referenced: Set<string>, missing: Set<string>, used: Map<string, Map<string, number>>) {
    const body = doc.querySelector('body')!;
    const notes = convertFootnotes(doc, body);
    const targetOf = (key: string) => {
        const e = map.classes[key];
        if (!e) { missing.add(key); return ''; }
        return e.target;
    };
    const note = (orig: string, out: string) => { // relatório estilo original → estilo do editor
        const m = used.get(orig) ?? new Map<string, number>();
        m.set(out, (m.get(out) ?? 0) + 1);
        used.set(orig, m);
    };

    // 1) resolver o CSS do InDesign de cada elemento ANTES de mexer na árvore
    const own = new Map<Element, { tokens: string[]; full: Props; own: Props }>();
    for (const el of Array.from(body.querySelectorAll('*'))) {
        const tokens = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
        const full = resolve(el.localName, tokens, el.getAttribute('style') ?? '', el.getAttribute('id') ?? '');
        const baseP = resolve(el.localName, []);
        own.set(el, { tokens, full, own: Object.fromEntries(Object.entries(full).filter(([k, v]) => baseP[k] !== v)) });
    }

    // 2) do mais interior para o exterior
    for (const el of Array.from(body.querySelectorAll('*')).reverse()) {
        const tag = el.localName;
        const info = own.get(el)!;
        el.removeAttribute('style');
        if (tag === 'aside' || (tag === 'div' && el.getAttribute('class') === 'footnotes-section')) continue; // nossos

        if (BLOCK_TAGS.has(tag)) {
            const r = translateParagraph(intentOf(info.full, base), {
                targets: info.tokens.map(t => targetOf(`${tag}.${t}`)),
                where: el.closest('aside') ? 'note' : el.closest('td, th') ? 'table' : 'body',
                frontMatter: front, text: el.textContent ?? '', vocabulary,
            });
            if ('remove' in r) { el.remove(); continue; }
            if (r.classes.length) el.setAttribute('class', r.classes.join(' ')); else el.removeAttribute('class');
            if (r.align) el.setAttribute('style', `text-align: ${r.align};`);
            note(`${tag}.${info.tokens.join('.')}`, `${r.tag}${r.classes.length ? '.' + r.classes.join('.') : ''}${r.align ? ` [${r.align}]` : ''}`);
            if (r.tag !== tag) rename(el, r.tag);
            continue;
        }

        if (tag === 'span') {
            const r = translateSpan(info.own, info.tokens.map(t => targetOf(`span.${t}`)));
            if ('remove' in r) { el.remove(); continue; }
            const { wraps, classes: spanCls } = r;
            el.removeAttribute('class');
            if (spanCls.length) el.setAttribute('class', spanCls.join(' '));
            if (wraps.length) {
                const outer = doc.createElementNS(XHTML_NS, wraps[0]);
                let cur = outer;
                for (const w of wraps.slice(1)) { const n = doc.createElementNS(XHTML_NS, w); cur.appendChild(n); cur = n; }
                el.replaceWith(outer);
                cur.appendChild(el);
            }
            if (!el.attributes.length) unwrap(el); // span sem classe nem id/lang/epub:type
            continue;
        }

        // restantes (div, img, table, td, ul, li, a…): sem classes — o CSS do editor trata do aspecto
        el.removeAttribute('class');
        if (tag === 'div' && el.getAttribute('role') !== 'doc-pagebreak') {
            // id referenciado (nav/links) passa para o 1º elemento de dentro; o contentor sai sempre
            const id = el.getAttribute('id') ?? '', first = el.firstElementChild;
            if (referenced.has(id) && first && !first.hasAttribute('id')) first.setAttribute('id', id);
            if (!referenced.has(id) || first?.getAttribute('id') === id) unwrap(el);
        }
        // âncoras de texto vazias do InDesign que nada referencia
        if (tag === 'a' && !el.hasAttribute('href') && !el.childNodes.length && !referenced.has(el.getAttribute('id') ?? '')) el.remove();
    }

    // Modelo de notas da app: o nº (noteref/backlink) tem de estar dentro de <sup>
    for (const a of Array.from(body.querySelectorAll('a[role="doc-noteref"], a[role="doc-backlink"]'))) {
        if (a.closest('sup')) continue;
        const sup = doc.createElementNS(XHTML_NS, 'sup');
        a.replaceWith(sup);
        sup.appendChild(a);
    }
    // Quebras de página: <div> → <span> (o editor só lê spans); soltas entre parágrafos entram no bloco seguinte
    for (const d of Array.from(body.querySelectorAll('[role="doc-pagebreak"]'))) {
        const span = d.localName === 'span' ? d : rename(d, 'span');
        // a quebra tem de ficar vazia: o InDesign às vezes mete lá dentro o nº da nota → vai junto, a seguir
        const inner = Array.from(span.childNodes);
        const loose = ['body', 'aside', 'div', 'section'].includes(span.parentElement!.localName);
        const next = span.nextElementSibling, prev = span.previousElementSibling;
        if (loose && next && BLOCK_TAGS.has(next.localName)) next.prepend(span, ...inner);
        else if (loose && prev && BLOCK_TAGS.has(prev.localName)) prev.append(span, ...inner); // fim de nota/secção
        else span.after(...inner);
    }
    // Parágrafos/títulos vazios (espaçamento à mão no InDesign) → p-top no parágrafo seguinte, como no editor
    for (const p of Array.from(body.querySelectorAll('p, h1, h2, h3, h4, h5, h6'))) {
        if ((p.textContent ?? '').trim() || p.querySelector('img, br')) continue;
        const next = p.nextElementSibling;
        if (next?.localName === 'p' && !/\bp-(top|space)\b/.test(next.getAttribute('class') ?? '')) {
            next.setAttribute('class', `${next.getAttribute('class') ?? ''} p-top`.trim());
        }
        // quebras de página que lá estejam vão para o início do bloco seguinte (o título continua a abrir o ficheiro)
        if (next && BLOCK_TAGS.has(next.localName)) next.prepend(...Array.from(p.childNodes));
        else p.after(...Array.from(p.childNodes));
        p.remove();
    }
    // <h1> seguidos (abertura + título) → um só <h1>A<br/>B</h1> (convenção do editor), senão 2 capítulos
    for (const h of Array.from(body.querySelectorAll('h1')).reverse()) {
        const prev = h.previousElementSibling;
        if (prev?.localName !== 'h1') continue;
        prev.appendChild(doc.createElementNS(XHTML_NS, 'br'));
        moveChildren(h, prev);
        h.remove();
    }
    return notes;
}

function renderXhtml(doc: Document, cssHref: string): string {
    const html = doc.documentElement;
    const lang = html.getAttribute('lang') ?? html.getAttribute('xml:lang') ?? 'pt-PT';
    const title = doc.querySelector('title')?.textContent ?? '';
    const body = doc.querySelector('body')!;
    const parts = Array.from(body.childNodes)
        .filter(n => n.nodeType !== 3 || n.textContent!.trim())
        .map(n => '  ' + serialize(n).replace(/ xmlns(:epub)?="[^"]*"/g, '').replace(/&nbsp;/g, '&#160;')); // happy-dom escreve &nbsp; (inválido em XHTML)
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="${XHTML_NS}" xmlns:epub="${EPUB_NS}" lang="${lang}" xml:lang="${lang}">
<head>
  <title>${esc(title)}</title>
  <meta charset="utf-8" />
  <link rel="stylesheet" type="text/css" href="${cssHref}" />
</head>
<body>
${parts.join('\n')}
</body>
</html>
`;
}

type ConvertReport = {
    documents: number; notes: number; bodySize: number;
    alreadyOptimized: boolean;                                         // EPUB já no formato da app → devolvido tal e qual
    missing: string[];                                                 // classes do livro que faltam no mapa
    styles: { original: string; count: number; editor: [string, number][] }[]; // estilo original → estilo do editor (ordenado)
};

// editorCss = CSS do editor (a CLI lê o DEFAULT_CSS da app; os testes passam um mínimo).
export async function convertBook(bytes: Uint8Array, map: BookMap, editorCss: string, opts: { joinLineBreaks?: boolean } = {}): Promise<{ bytes: Uint8Array; report: ConvertReport }> {
    const book = await openBook(bytes);
    if (isAlreadyOptimized(book)) {
        return { bytes, report: { documents: book.documents.length, notes: 0, bodySize: book.bodySize, alreadyOptimized: true, missing: [], styles: [] } };
    }
    const { zip, opfPath, opfDir, items, resolve, bodySize: base, referencedIds: referenced, frontMatter } = book;
    const docs = new Map(book.documents.map(d => [d.href, d.doc]));
    const vocabulary = editorVocabulary(editorCss);

    const STYLE_HREF = 'css/style.css';
    const cssRel = (docHref: string) => '../'.repeat(docHref.split('/').length - 1) + STYLE_HREF; // relativo ao documento
    const missing = new Set<string>();
    const used = new Map<string, Map<string, number>>();
    let notes = 0;

    // nav/capa (xhtml fora do conteúdo): só troca o(s) stylesheet(s) pelo novo
    for (const item of items.filter(i => i.type === 'application/xhtml+xml' && !docs.has(i.href))) {
        const path = opfDir + item.href;
        const text = await zip.file(path)!.async('text');
        const replaced = text.replace(/<link\b[^>]*rel="stylesheet"[^>]*\/?>\s*/g, '');
        zip.file(path, /<link\b[^>]*rel="stylesheet"/.test(text)
            ? replaced.replace('</head>', `\t<link href="${cssRel(item.href)}" rel="stylesheet" type="text/css"/>\n</head>`)
            : text);
    }
    // conteúdo pela ordem de leitura (spine) — o 1.º de cada <title> repetido é o que conta (ver abaixo)
    const seenTitles = new Set<string>();
    for (const { href, doc } of book.documents) {
        const path = opfDir + href;
        const front = frontMatter.has(href);
        const hasImg = !!doc.querySelector('body img');
        const hadHeading = Array.from(doc.querySelectorAll('body p[class]')).some(p => (p.getAttribute('class') ?? '')
            .split(/\s+/).some(c => /(^|\s)h[1-6](\s|$)/.test(map.classes[`p.${c}`]?.target ?? '')));
        notes += convertBody(doc, map, resolve, base, front, vocabulary, referenced, missing, used);
        if (opts.joinLineBreaks) joinLineBreaks(doc.querySelector('body')!);
        // <title> = nome do capítulo no editor; política do InDesign em titles.ts
        const titleEl = doc.querySelector('title');
        if (titleEl) {
            let title = indesignTitle({ title: titleEl.textContent ?? '', href,
                bodyText: doc.querySelector('body')!.textContent ?? '', frontMatter: front, hasImage: hasImg, hasHeading: hadHeading,
                paragraphs: Array.from(doc.querySelectorAll('body p')).map(p => p.textContent ?? '') });
            // título repetido (ex. "Sun Tzu disse:" em cada capítulo) só cria um capítulo: os seguintes ficam sem
            // título (nome do ficheiro) e juntam-se ao anterior (decisão do utilizador)
            const name = chapterTitleOf(title, href);
            if (name && seenTitles.has(name)) title = href.split('/').pop()!.replace(/\.x?html?$/i, '');
            else if (name) seenTitles.add(name);
            if (title !== titleEl.textContent) titleEl.textContent = title;
        }
        zip.file(path, renderXhtml(doc, cssRel(href)));
    }

    const style = editorCss + '\n'; // CSS = o do editor

    // OPF: tira o CSS (e fontes) antigos, junta o style.css; nav fora do spine
    let opf = book.opf;
    for (const i of items.filter(i => i.type === 'text/css' || /font|opentype|truetype|woff/i.test(i.type))) {
        opf = opf.replace(i.raw, '').replace(/\n\s*\n/g, '\n');
        zip.remove(opfDir + i.href);
    }
    opf = opf.replace('</manifest>', `\t<item id="style" href="${STYLE_HREF}" media-type="text/css"/>\n\t</manifest>`);
    // EPUB3 não exige o nav no spine; os leitores mostram o índice próprio e o editor não o importa como capítulo
    const nav = items.find(i => i.props.split(/\s+/).includes('nav'));
    if (nav) opf = opf.replace(new RegExp(`\\s*<itemref\\b[^>]*idref="${nav.id}"[^>]*/>`), '');
    zip.file(opfPath, opf);
    zip.file(opfDir + STYLE_HREF, style);

    // mimetype tem de ser a 1ª entrada e sem compressão
    const out = new JSZip();
    out.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    for (const f of Object.values(zip.files)) {
        if (f.dir || f.name === 'mimetype') continue;
        out.file(f.name, await f.async('uint8array'));
    }
    const sum = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);
    return {
        bytes: await out.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/epub+zip' }),
        report: {
            documents: book.documents.length, notes, bodySize: base, alreadyOptimized: false, missing: [...missing],
            styles: [...used].sort((a, b) => sum(b[1]) - sum(a[1])).map(([original, outs]) => ({
                original, count: sum(outs), editor: [...outs].sort((a, b) => b[1] - a[1]),
            })),
        },
    };
}

// ---------- verify: original × optimizado (estrutura e intenção, com os valores do editor) ----------
// Mesma leitura de intenção que o convert (translate.ts), nos dois lados; só os campos preservados contam.
type Preserved = ReturnType<typeof preservedOf>;

// texto para comparar original × optimizado: sem espaços; "--"/"//" = "-"/"/" (o <br/> do paginador junta hífen/barra
// repetidos no início da linha e passa a espaço — nada disso é texto perdido)
const comparable = (s: string) => s.replace(/\s+/g, '').replace(/-{2,}/g, '-').replace(/\/{2,}/g, '/');

async function blocks(bytes: Uint8Array, opt: boolean) {
    const { documents, resolve, css } = await openBook(bytes);
    const out: { key: string; text: string; match: string; v: Preserved; empty: boolean; skip: boolean }[] = [];
    let allText = '', imgs = 0, pages = 0, notes = 0;
    for (const { doc } of documents) {
        const body = doc.querySelector('body')!;
        allText += comparable(body.textContent ?? '');
        imgs += body.querySelectorAll('img').length;
        pages += body.querySelectorAll('[role="doc-pagebreak"]').length;
        // notas pelo significado (InDesign li._idFootnote ou já no formato da app, role=doc-footnote): o
        // original pode ser um EPUB já optimizado — contar só li._idFootnote dava "notas 0 → N"
        notes += body.querySelectorAll('li._idFootnote, [role="doc-footnote"]').length;
        for (const el of Array.from(body.querySelectorAll('body p, body h1, body h2, body h3, body h4, body h5, body h6'))) {
            const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
            const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
            // corpo do texto não é comparado → bodySize 1 chega
            const v = preservedOf(intentOf(resolve(el.localName, classes, el.getAttribute('style') ?? ''), 1));
            // notas, tabelas e títulos seguem o estilo do editor — só o texto conta
            const skip = !!el.closest(opt ? 'aside, td, th' : 'li, td, th') || /^h[1-6]$/.test(el.localName);
            out.push({ key: `${el.localName}.${classes.join('.')}`, text, match: comparable(text), empty: !text && !el.querySelector('img'), v, skip });
        }
    }
    return { out, allText, imgs, pages, notes, documents, css };
}

type IntentDiff = { original: string; prop: string; want: string; got: string; optimized: string; count: number; example: string };
type VerifyReport = {
    paired: number; unpaired: number;
    diffs: IntentDiff[];                                               // ordenadas por nº de ocorrências
    text: { ok: boolean; length: number; at: number; original: string; optimized: string };
    images: [number, number]; pages: [number, number]; notes: [number, number];
    foreignClasses: string[];                                          // classes no resultado que não são do editor
};

export async function verifyBook(originalBytes: Uint8Array, optimizedBytes: Uint8Array): Promise<VerifyReport> {
    const O = await blocks(originalBytes, false), P = await blocks(optimizedBytes, true);
    const opt = P.out.filter(b => !b.empty);
    const diffs = new Map<string, IntentDiff>();
    let paired = 0, unpaired = 0, j = 0, pendingAbove = false;
    for (const o of O.out) {
        if (o.empty) { pendingAbove = true; continue; } // vazio = espaço acima do seguinte
        // <h1> fundido com o anterior (abertura + título): o texto está no último emparelhado
        if (j > 0 && /^h1\./.test(opt[j - 1].key) && opt[j - 1].match.includes(o.match) && !opt[j - 1].match.startsWith(o.match)) { paired++; continue; }
        let k = j;
        while (k < opt.length && k < j + 30 && !opt[k].match.startsWith(o.match)) k++;
        if (k >= opt.length || k >= j + 30) { unpaired++; continue; }
        const b = opt[k];
        j = k + 1;
        paired++;
        const above = pendingAbove;
        pendingAbove = false;
        if (o.skip || b.skip) continue;
        const want = { ...o.v, above: o.v.above || above };
        for (const prop of Object.keys(want) as (keyof Preserved)[]) {
            if (want[prop] === b.v[prop]) continue;
            if (prop === 'below' && /p-legendas/.test(b.key)) continue; // espaço abaixo faz parte do estilo Legenda do editor
            const key = [o.key, prop, want[prop], b.v[prop], b.key].join('\u0000');
            const d = diffs.get(key) ?? { original: o.key, prop, want: String(want[prop]), got: String(b.v[prop]), optimized: b.key, count: 0, example: o.text.slice(0, 50) };
            d.count++;
            diffs.set(key, d);
        }
    }
    const at = [...O.allText].findIndex((ch, i) => ch !== P.allText[i]);
    // classes no resultado que não estão definidas no próprio CSS (do editor) do EPUB optimizado
    const vocabulary = editorVocabulary(P.css);
    const foreign = new Set<string>();
    for (const { raw } of P.documents) {
        for (const m of raw.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) {
            if (c && !vocabulary.has(c)) foreign.add(c);
        }
    }
    return {
        paired, unpaired, diffs: [...diffs.values()].sort((a, b) => b.count - a.count),
        text: {
            ok: at === -1 && O.allText.length === P.allText.length, length: O.allText.length, at,
            original: O.allText.slice(Math.max(0, at - 30), at + 30), optimized: P.allText.slice(Math.max(0, at - 30), at + 30),
        },
        images: [O.imgs, P.imgs], pages: [O.pages, P.pages], notes: [O.notes, P.notes], foreignClasses: [...foreign],
    };
}

// ---------- optimize (convert + verify + política) ----------
// Política da verificação, igual para a app e a CLI: perder conteúdo (texto, imagens, quebras de página, notas)
// é PROBLEMA (bloqueia, salvo Importação forçada); diferenças de intenção e classes fora do editor são AVISOS.
// EPUB já optimizado: o convert devolve-o tal e qual → nada a verificar.
export type Problem = { kind: 'text' | 'images' | 'pages' | 'notes'; message: string };
export type Warning = { kind: 'intent' | 'classes'; message: string };

export async function optimizeBook(bytes: Uint8Array, map: BookMap, editorCss: string, opts: { joinLineBreaks?: boolean } = {}) {
    const { bytes: out, report } = await convertBook(bytes, map, editorCss, opts);
    if (report.alreadyOptimized) return { bytes: out, report, verify: null, problems: [] as Problem[], warnings: [] as Warning[] };
    const v = await verifyBook(bytes, out);
    const lost = (kind: Problem['kind'], label: string, [a, b]: [number, number]): Problem[] =>
        a === b ? [] : [{ kind, message: `${label} ${a} → ${b}` }];
    const problems: Problem[] = [
        ...(v.text.ok ? [] : [{ kind: 'text' as const, message: `texto diferente na posição ${v.text.at} («${v.text.original}» → «${v.text.optimized}»)` }]),
        ...lost('images', 'imagens', v.images), ...lost('pages', 'quebras de página', v.pages), ...lost('notes', 'notas', v.notes),
    ];
    const diffs = v.diffs.reduce((n, d) => n + d.count, 0);
    const warnings: Warning[] = [
        ...(diffs ? [{ kind: 'intent' as const, message: `${diffs} diferença(s)` }] : []),
        ...(v.foreignClasses.length ? [{ kind: 'classes' as const, message: `classes fora do editor: ${v.foreignClasses.join(', ')}` }] : []),
    ];
    return { bytes: out, report, verify: v, problems, warnings };
}
