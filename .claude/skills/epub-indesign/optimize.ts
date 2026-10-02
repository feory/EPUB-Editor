#!/usr/bin/env bun
// Optimiza EPUBs exportados do InDesign para os ESTILOS DO EDITOR: cada parágrafo passa a usar as classes
// do editor (p-indent, p-top, p-center, p-small, p-quote, p-bold…) com os valores do editor (CSS =
// DEFAULT_CSS do StyleContext), escolhidas a partir do CSS original (estilo + overrides); alinhamento à
// direita/esquerda como o editor o grava (style inline). Tira o lixo do InDesign e converte notas/quebras
// de página para o modelo da app.
//   bun .claude/skills/epub-indesign/optimize.ts analyze <livro.epub>  → <dir>/mapas/<livro>.json
//   bun .claude/skills/epub-indesign/optimize.ts convert <livro.epub>  → <dir>/optimizados/<livro>.epub
//   bun .claude/skills/epub-indesign/optimize.ts verify  <livro.epub>  → texto/estrutura/intenção original × optimizado
// O mapa decide a semântica (títulos, itálico…) e pode forçar classes do editor; ver SKILL.md.
import JSZip from 'jszip';
import { Window } from 'happy-dom';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';
import { EDITOR_CLASSES, fontEm, intentOf, isBold, isItalic, preservedOf, translateParagraph, translateSpan, type Props } from './translate';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const EPUB_NS = 'http://www.idpf.org/2007/ops';
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// Propriedades sem efeito em leitores EPUB / específicas do InDesign
const JUNK = /^(-epub-|-webkit-|-moz-|adobe-|orphans$|widows$|page-break-|break-)/;
const SOFT_HYPHEN = /\u00AD|&#173;|&#xad;|&shy;/gi; // hífenes discricionários do InDesign (paginação impressa)

const win = new Window();
const parseXml = (s: string) => new win.DOMParser().parseFromString(s, 'application/xhtml+xml') as unknown as Document;
const serialize = (n: Node) => new win.XMLSerializer().serializeToString(n as never);

type MapEntry = { target: string; origem?: string; count?: number; sample?: string; css?: string };
type BookMap = { extras: string; classes: Record<string, MapEntry> };

// ---------- EPUB ----------
async function openEpub(path: string) {
    const zip = await JSZip.loadAsync(readFileSync(path));
    const container = await zip.file('META-INF/container.xml')!.async('text');
    const opfPath = container.match(/full-path="([^"]+)"/)![1];
    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const opf = await zip.file(opfPath)!.async('text');
    const items = [...opf.matchAll(/<item\b[^>]*>/g)].map(m => ({
        raw: m[0],
        id: m[0].match(/\bid="([^"]+)"/)?.[1] ?? '',
        href: decodeURIComponent(m[0].match(/\bhref="([^"]+)"/)?.[1] ?? ''),
        type: m[0].match(/media-type="([^"]+)"/)?.[1] ?? '',
        props: m[0].match(/properties="([^"]+)"/)?.[1] ?? '',
    }));
    const byId = new Map(items.map(i => [i.id, i]));
    const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map(m => byId.get(m[1])!).filter(Boolean);
    // Conteúdo = spine sem nav nem capa (essas só têm o link do CSS trocado).
    const content = spine.filter(i => !i.props.includes('nav') && !/cover/i.test(i.id + i.href));
    let css = '';
    for (const i of items.filter(i => i.type === 'text/css')) css += await zip.file(opfDir + i.href)!.async('text') + '\n';
    return { zip, opfPath, opfDir, opf, items, content, css };
}

// ---------- CSS ----------
const cssRules = (css: string) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map(m => ({ sel: m[1].trim(), body: m[2] }));
function declarations(body: string) {
    const props: Props = {}, imp = new Set<string>();
    for (const d of body.split(';')) {
        const i = d.indexOf(':');
        if (i <= 0) continue;
        const k = d.slice(0, i).trim().toLowerCase();
        let v = d.slice(i + 1).trim();
        const important = /!important/.test(v);
        v = v.replace(/\s*!important/, '');
        // shorthands → longhands, senão `margin:0` (reset do InDesign) e `margin-top:100px` coexistem
        // como chaves diferentes e a ordem decide mal
        for (const [lk, lv] of Object.entries(expand(k, v))) {
            props[lk] = lv;
            if (important) imp.add(lk);
        }
    }
    return { props, imp };
}
const SIDES = ['top', 'right', 'bottom', 'left'];
function expand(k: string, v: string): Props {
    const four = (vals: string[]) => [vals[0], vals[1] ?? vals[0], vals[2] ?? vals[0], vals[3] ?? vals[1] ?? vals[0]];
    if (k === 'margin' || k === 'padding') {
        const vals = four(v.split(/\s+/));
        return Object.fromEntries(SIDES.map((s, i) => [`${k}-${s}`, vals[i]]));
    }
    const bm = k.match(/^border-(width|style|color)$/);
    if (bm) {
        const vals = four(v.split(/\s+/));
        return Object.fromEntries(SIDES.map((s, i) => [`border-${s}-${bm[1]}`, vals[i]]));
    }
    const bs = k.match(/^border(?:-(top|right|bottom|left))?$/);
    if (bs) { // border: 1px solid #000 → por lado
        const parts = v.split(/\s+/), out: Props = {};
        const width = parts.find(p => /^(\d|thin|medium|thick)/.test(p)) ?? 'medium';
        const style = parts.find(p => /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/.test(p)) ?? 'none';
        const color = parts.find(p => p !== width && p !== style) ?? 'currentcolor';
        for (const s of bs[1] ? [bs[1]] : SIDES) Object.assign(out, { [`border-${s}-width`]: width, [`border-${s}-style`]: style, [`border-${s}-color`]: color });
        return out;
    }
    return { [k]: v };
}

// Cascata simplificada (selectores `tag`, `.c`, `tag.c`, listas com vírgula; !important; style inline).
// Chega para o CSS plano do InDesign e para o EPUB_CSS; ignora descendentes/pseudo-classes.
function cascade(css: string) {
    type Rule = { tag: string; cls: string; id: string; spec: number; order: number; props: Props; imp: Set<string> };
    const rules: Rule[] = [];
    let order = 0;
    const NAME = '([^\\s.,:#>+~\\[\\]]+)'; // nomes com acentos (Dedicatória)
    for (const { sel, body } of cssRules(css)) {
        if (sel.startsWith('@')) continue;
        const { props, imp } = declarations(body);
        for (const s of sel.split(',')) {
            // tag | .c | tag.c | #id | tag#id  (o InDesign dá tamanhos de imagens/caixas por #_idContainerNNN)
            const sm = s.trim().match(new RegExp(`^([a-z0-9]*)(?:\\.${NAME})?(?:#${NAME})?$`, 'i'));
            if (!sm || (!sm[1] && !sm[2] && !sm[3])) continue;
            const tag = sm[1].toLowerCase(), cls = sm[2] ?? '', id = sm[3] ?? '';
            rules.push({ tag, cls, id, spec: (tag ? 1 : 0) + (cls ? 10 : 0) + (id ? 100 : 0), order: order++, props, imp });
        }
    }
    return (tag: string, classes: string[], inline = '', id = ''): Props => {
        const hits = rules.filter(r => (!r.tag || r.tag === tag) && (!r.cls || classes.includes(r.cls)) && (!r.id || r.id === id))
            .sort((a, b) => a.spec - b.spec || a.order - b.order);
        const out: Props = {};
        for (const r of hits) Object.assign(out, r.props);
        Object.assign(out, declarations(inline).props);
        for (const r of hits) for (const k of r.imp) out[k] = r.props[k];
        return out;
    };
}

// -epub-hyphens é o que os leitores usam para hifenizar → passa a `hyphens` (standard), não é lixo
const clean = (p: Props): Props => Object.fromEntries(Object.entries(p)
    .map(([k, v]) => k === '-epub-hyphens' ? ['hyphens', v] : [k, v]).filter(([k]) => !JUNK.test(k)));
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
async function analyze(epubPath: string) {
    const { zip, opfDir, content, css } = await openEpub(epubPath);
    const resolve = cascade(css);
    const basePath = join(import.meta.dir, 'estilos-base.json');
    const baseMap: Record<string, string> = existsSync(basePath) ? JSON.parse(readFileSync(basePath, 'utf8')) : {};
    const baseLookup = new Map(Object.entries(baseMap).map(([k, v]) => [k.toLowerCase(), v]));

    const found = new Map<string, { count: number; chars: number; sample: string }>();
    for (const item of content) {
        const doc = parseXml(await zip.file(opfDir + item.href)!.async('text'));
        for (const el of Array.from(doc.querySelectorAll('p[class], span[class]'))) {
            for (const t of el.getAttribute('class')!.split(/\s+/).filter(Boolean)) {
                const key = `${el.localName}.${t}`;
                const e = found.get(key) ?? { count: 0, chars: 0, sample: '' };
                e.count++;
                e.chars += (el.textContent ?? '').length;
                if (!e.sample) e.sample = (el.textContent ?? '').trim().slice(0, 70);
                found.set(key, e);
            }
        }
    }
    // font-size base = classe de <p> com mais texto (o corpo do livro)
    const topP = [...found].filter(([k]) => k.startsWith('p.')).sort((a, b) => b[1].chars - a[1].chars)[0];
    const base = em(topP ? resolve('p', [topP[0].slice(2)])['font-size'] : '') || 1;

    const mapPath = mapPathFor(epubPath);
    const prev: BookMap | null = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : null;
    const classes: Record<string, MapEntry> = {};
    for (const [key, { count, sample }] of [...found].sort((a, b) => b[1].count - a[1].count)) {
        const [tag, cls] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
        const p = resolve(tag, [cls]);
        const fromBase = baseLookup.get(key.toLowerCase());
        const reviewed = prev?.classes[key]?.origem === 'revisto' ? prev.classes[key] : undefined; // revisões nunca são sobrescritas
        classes[key] = {
            target: reviewed?.target ?? fromBase ?? suggest(tag, cls, p, base),
            origem: reviewed ? 'revisto' : fromBase !== undefined ? 'base' : 'css',
            count, sample, css: cssSummary(p),
        };
    }
    const map: BookMap = { extras: prev?.extras ?? '', classes };
    mkdirSync(dirname(mapPath), { recursive: true });
    writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n');
    console.log(`Mapa: ${mapPath}  (texto base ${base}em)\n`);
    for (const [k, e] of Object.entries(classes)) {
        console.log(`${String(e.count).padStart(6)}  ${k.padEnd(36)} → ${(e.target || '∅').padEnd(14)} [${e.origem}] ${e.css}`);
    }
}

const mapPathFor = (epub: string) => join(dirname(epub), 'mapas', basename(epub, '.epub') + '.json');

// ---------- convert ----------
// CSS do editor = DEFAULT_CSS do StyleContext (o style.css de um livro novo da app), sem a secção
// editor-only nem @font-face — exatamente o que a app exporta.
function editorCss(): string {
    const src = readFileSync(join(import.meta.dir, '../../../src/context/StyleContext.tsx'), 'utf8');
    let css = src.match(/export const DEFAULT_CSS = `([\s\S]*?)`;/)![1];
    const cut = css.indexOf('/* === EDITOR (não exportado para EPUB) === */');
    if (cut !== -1) css = css.slice(0, cut);
    return css.replace(/@font-face\s*\{[^}]*\}/g, '').replace(/^ {4}/gm, '').replace(/\n{3,}/g, '\n\n').trim();
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

function convertBody(doc: Document, map: BookMap, resolve: ReturnType<typeof cascade>, base: number, front: boolean,
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
        const full = clean(resolve(el.localName, tokens, el.getAttribute('style') ?? '', el.getAttribute('id') ?? ''));
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
                frontMatter: front, text: el.textContent ?? '',
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

// Corpo do texto corrente (em): o font-size de <p> com mais texto no livro
async function bodySize(zip: JSZip, opfDir: string, content: { href: string }[], resolve: ReturnType<typeof cascade>) {
    const chars = new Map<number, number>();
    for (const item of content) {
        const doc = parseXml((await zip.file(opfDir + item.href)!.async('text')).replace(SOFT_HYPHEN, ''));
        for (const p of Array.from(doc.querySelectorAll('body p'))) {
            const s = fontEm(resolve('p', (p.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)));
            chars.set(s, (chars.get(s) ?? 0) + (p.textContent ?? '').length);
        }
    }
    return [...chars].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;
}

async function convert(epubPath: string) {
    const mapPath = mapPathFor(epubPath);
    if (!existsSync(mapPath)) throw new Error(`Falta o mapa ${mapPath} — correr "analyze" primeiro.`);
    const map: BookMap = JSON.parse(readFileSync(mapPath, 'utf8'));
    const { zip, opfPath, opfDir, items, content, css } = await openEpub(epubPath);
    const resolve = cascade(css);
    const base = await bodySize(zip, opfDir, content, resolve);

    // ids referenciados por links (nav, ncx, índice remissivo…) — as âncoras desses ficam.
    const referenced = new Set<string>();
    for (const f of Object.values(zip.files)) {
        if (!/\.(xhtml|html|ncx)$/i.test(f.name)) continue;
        for (const m of (await f.async('text')).matchAll(/(?:href|src)="[^"#]*#([^"]+)"/g)) referenced.add(m[1]);
    }

    // Páginas antes do Índice (rosto, ficha técnica…) — só se o livro tiver Índice
    const frontMatter = new Set<string>();
    for (const item of content) {
        const t = await zip.file(opfDir + item.href)!.async('text');
        const title = (t.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
        const first = (t.split(/<body[^>]*>/)[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (/^[íi]ndice$/i.test(title) || /^[íi]ndice\b/i.test(first)) break;
        frontMatter.add(item.href);
    }
    if (frontMatter.size === content.length) frontMatter.clear(); // sem Índice → regra não se aplica

    const STYLE_HREF = 'css/style.css';
    const cssRel = (docHref: string) => posix.relative(posix.dirname(docHref), STYLE_HREF) || STYLE_HREF;
    const missing = new Set<string>();
    const used = new Map<string, Map<string, number>>();
    let notes = 0;
    const contentHrefs = new Set(content.map(i => i.href));

    for (const item of items.filter(i => i.type === 'application/xhtml+xml')) {
        const path = opfDir + item.href;
        const text = await zip.file(path)!.async('text');
        if (!contentHrefs.has(item.href)) {
            // nav/capa: só troca o(s) stylesheet(s) pelo novo
            const replaced = text.replace(/<link\b[^>]*rel="stylesheet"[^>]*\/?>\s*/g, '');
            zip.file(path, /<link\b[^>]*rel="stylesheet"/.test(text)
                ? replaced.replace('</head>', `\t<link href="${cssRel(item.href)}" rel="stylesheet" type="text/css"/>\n</head>`)
                : text);
            continue;
        }
        const doc = parseXml(text.replace(SOFT_HYPHEN, '')); // hífenes discricionários do InDesign (paginação impressa)
        const front = frontMatter.has(item.href);
        const hasImg = !!doc.querySelector('body img');
        const hadHeading = Array.from(doc.querySelectorAll('body p[class]')).some(p => (p.getAttribute('class') ?? '')
            .split(/\s+/).some(c => /^h[1-6]$/.test((map.classes[`p.${c}`]?.target ?? '').split(/\s+/).find(x => /^h/.test(x)) ?? '')));
        notes += convertBody(doc, map, resolve, base, front, referenced, missing, used);
        // <title> é o nome do capítulo no editor. O InDesign deixa títulos falsos (rótulo "Título original:",
        // vazio, nome do ficheiro, título do livro). Decisões do utilizador:
        //  - ficha técnica (©/ISBN/Título original) com título falso, ou antes do Índice → "Ficha Técnica"
        //  - antes do Índice, com títulos/imagem → "Rosto"; texto simples (dedicatória) mantém;
        //    título = nome do ficheiro → sem título (página de imagem junta-se à anterior)
        //  - depois do Índice, rótulo copiado da ficha → "Rosto"
        const titleEl = doc.querySelector('title');
        const t = (titleEl?.textContent ?? '').trim();
        const label = /:$/.test(t) || /^t[íi]tulo( original)?$/i.test(t);
        const noTitle = !t || t === basename(item.href).replace(/\.x?html?$/i, ''); // fica sem título (junta ao anterior)
        const ficha = /©|ISBN|Dep[óo]sito legal|T[íi]tulo original/i.test(doc.querySelector('body')!.textContent ?? '');
        if (titleEl && ficha && (label || noTitle || front)) titleEl.textContent = 'Ficha Técnica';
        else if (titleEl && !noTitle && (label || (front && (hadHeading || hasImg)))) titleEl.textContent = 'Rosto';
        zip.file(path, renderXhtml(doc, cssRel(item.href)));
    }

    // CSS = o do editor (+ extras do mapa, se houver)
    const style = [editorCss(), map.extras.trim()].filter(Boolean).join('\n\n') + '\n';

    // OPF: tira o CSS (e fontes) antigos, junta o style.css; nav fora do spine
    let opf = await zip.file(opfPath)!.async('text');
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
    const outPath = join(dirname(epubPath), 'optimizados', basename(epubPath));
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, await out.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/epub+zip' }));

    console.log(`✓ ${outPath}`);
    console.log(`  ${content.length} documentos, ${notes} notas convertidas, corpo do texto ${base}em`);
    if (missing.size) console.log(`  ⚠ classes fora do mapa (correr analyze): ${[...missing].join(', ')}`);
    console.log('\n  Estilo original → estilo do editor');
    for (const [orig, outs] of [...used].sort((a, b) => sum(b[1]) - sum(a[1]))) {
        console.log(`  ${String(sum(outs)).padStart(6)}  ${orig.padEnd(40)} → ${[...outs].sort((a, b) => b[1] - a[1]).map(([o, n]) => outs.size > 1 ? `${o} (${n})` : o).join(', ')}`);
    }
}
const sum = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0);

// ---------- verify: original × optimizado (estrutura e intenção, com os valores do editor) ----------
// Mesma leitura de intenção que o convert (translate.ts), nos dois lados; só os campos preservados contam.
type Preserved = ReturnType<typeof preservedOf>;

async function blocks(path: string, opt: boolean) {
    const { zip, opfDir, content, css } = await openEpub(path);
    const resolve = cascade(css);
    const out: { key: string; text: string; v: Preserved; empty: boolean; skip: boolean }[] = [];
    let allText = '', imgs = 0, pages = 0, notes = 0;
    for (const item of content) {
        const doc = parseXml((await zip.file(opfDir + item.href)!.async('text')).replace(SOFT_HYPHEN, ''));
        const body = doc.querySelector('body')!;
        allText += (body.textContent ?? '').replace(/\s+/g, '');
        imgs += body.querySelectorAll('img').length;
        pages += body.querySelectorAll('[role="doc-pagebreak"]').length;
        notes += body.querySelectorAll(opt ? 'aside.footnote' : 'li._idFootnote').length;
        for (const el of Array.from(body.querySelectorAll('body p, body h1, body h2, body h3, body h4, body h5, body h6'))) {
            const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
            const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
            // corpo do texto não é comparado → bodySize 1 chega
            const v = preservedOf(intentOf(resolve(el.localName, classes, el.getAttribute('style') ?? ''), 1));
            // notas, tabelas e títulos seguem o estilo do editor — só o texto conta
            const skip = !!el.closest(opt ? 'aside, td, th' : 'li, td, th') || /^h[1-6]$/.test(el.localName);
            out.push({ key: `${el.localName}.${classes.join('.')}`, text, empty: !text && !el.querySelector('img'), v, skip });
        }
    }
    return { out, allText, imgs, pages, notes };
}

async function verify(epubPath: string) {
    const optPath = join(dirname(epubPath), 'optimizados', basename(epubPath));
    const O = await blocks(epubPath, false), P = await blocks(optPath, true);
    const opt = P.out.filter(b => !b.empty);
    const diffs = new Map<string, { n: number; ex: string }>();
    let paired = 0, unpaired = 0, j = 0, pendingAbove = false;
    for (const o of O.out) {
        if (o.empty) { pendingAbove = true; continue; } // vazio = espaço acima do seguinte
        // <h1> fundido com o anterior (abertura + título): o texto está no último emparelhado
        if (j > 0 && /^h1\./.test(opt[j - 1].key) && opt[j - 1].text.includes(o.text) && !opt[j - 1].text.startsWith(o.text)) { paired++; continue; }
        let k = j;
        while (k < opt.length && k < j + 30 && !opt[k].text.startsWith(o.text)) k++;
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
            const label = `${o.key.padEnd(34)} ${prop.padEnd(7)} ${String(want[prop]).padStart(7)} → ${String(b.v[prop]).padEnd(7)} (${b.key})`;
            const d = diffs.get(label) ?? { n: 0, ex: o.text.slice(0, 50) };
            d.n++;
            diffs.set(label, d);
        }
    }
    const total = [...diffs.values()].reduce((s, d) => s + d.n, 0);
    console.log(`\n${basename(epubPath)}: ${paired} parágrafos comparados, ${unpaired} sem par, ${total} diferenças de intenção${total || unpaired ? '' : ' ✓'}`);
    for (const [l, d] of [...diffs].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(d.n).padStart(5)}  ${l}  «${d.ex}»`);
    const at = [...O.allText].findIndex((ch, i) => ch !== P.allText[i]);
    console.log(at === -1 && O.allText.length === P.allText.length
        ? `  texto ✓ (${O.allText.length} caracteres)`
        : `  ⚠ TEXTO DIFERENTE na posição ${at}: «${O.allText.slice(Math.max(0, at - 30), at + 30)}» → «${P.allText.slice(Math.max(0, at - 30), at + 30)}»`);
    const ok = (a: number, b: number) => `${a} → ${b}${a === b ? ' ✓' : ' ⚠'}`;
    console.log(`  imagens ${ok(O.imgs, P.imgs)} · quebras de página ${ok(O.pages, P.pages)} · notas ${ok(O.notes, P.notes)}`);
    // só classes do editor no resultado
    const zipP = (await openEpub(optPath));
    const foreign = new Set<string>();
    for (const item of zipP.content) {
        const t = await zipP.zip.file(zipP.opfDir + item.href)!.async('text');
        for (const m of t.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) {
            if (c && !EDITOR_CLASSES.has(c) && !['footnote', 'footnotes-section', 'small-caps', 'pagebreak'].includes(c)) foreign.add(c);
        }
    }
    console.log(foreign.size ? `  ⚠ classes fora do editor: ${[...foreign].join(', ')}` : '  classes: só do editor ✓');
}

const [cmd, file] = process.argv.slice(2);
if (!file || !['analyze', 'convert', 'verify'].includes(cmd)) {
    console.error('uso: bun optimize.ts analyze|convert|verify <livro.epub>');
    process.exit(1);
}
await ({ analyze, convert, verify }[cmd as 'analyze'])(file);
