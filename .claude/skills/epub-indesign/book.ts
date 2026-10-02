// Livro InDesign aberto UMA vez: pacote (OPF, manifest, spine), cascata do CSS original, documentos do
// spine parseados, e os factos derivados que o analyze, o convert e o verify partilham.
//
//   openBook(bytes) → { zip, opfPath, opfDir, opf, items, documents, resolve, css, bodySize, referencedIds, frontMatter }
//
// Os factos são calculados ao abrir — ANTES de o convert alterar os documentos no sítio.
import JSZip from 'jszip';
import { Window } from 'happy-dom';
import { fontEm, type Props } from './translate';

// Propriedades sem efeito em leitores EPUB / específicas do InDesign
const JUNK = /^(-epub-|-webkit-|-moz-|adobe-|orphans$|widows$|page-break-|break-)/;
export const SOFT_HYPHEN = /\u00AD|&#173;|&#xad;|&shy;/gi; // hífenes discricionários do InDesign (paginação impressa)

const win = new Window();
export const parseXml = (s: string) => new win.DOMParser().parseFromString(s, 'application/xhtml+xml') as unknown as Document;
export const serialize = (n: Node) => new win.XMLSerializer().serializeToString(n as never);

export type Resolve = (tag: string, classes: string[], inline?: string, id?: string) => Props;
// raw = XHTML original (para o que precisa do texto tal e qual); doc = parseado sem hífenes discricionários
export type BookDocument = { href: string; raw: string; doc: Document };

// ---------- pacote ----------
async function openPackage(bytes: Uint8Array) {
    const zip = await JSZip.loadAsync(bytes);
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
export const clean = (p: Props): Props => Object.fromEntries(Object.entries(p)
    .map(([k, v]) => k === '-epub-hyphens' ? ['hyphens', v] : [k, v]).filter(([k]) => !JUNK.test(k)));

// Corpo do texto corrente (em): o font-size resolvido de <p> com mais texto no livro
function bodySizeOf(documents: BookDocument[], resolve: Resolve) {
    const chars = new Map<number, number>();
    for (const { doc } of documents) {
        for (const p of Array.from(doc.querySelectorAll('body p'))) {
            const s = fontEm(resolve('p', (p.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)));
            chars.set(s, (chars.get(s) ?? 0) + (p.textContent ?? '').length);
        }
    }
    return [...chars].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;
}

// Páginas antes do Índice (rosto, ficha técnica…) — vazio se o livro não tiver Índice
function frontMatterOf(documents: BookDocument[]) {
    const front = new Set<string>();
    for (const { href, raw } of documents) {
        const title = (raw.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
        const first = (raw.split(/<body[^>]*>/)[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (/^[íi]ndice$/i.test(title) || /^[íi]ndice\b/i.test(first)) break;
        front.add(href);
    }
    if (front.size === documents.length) front.clear(); // sem Índice → regra não se aplica
    return front;
}

export async function openBook(bytes: Uint8Array) {
    const { zip, opfPath, opfDir, opf, items, content, css } = await openPackage(bytes);
    const resolve: Resolve = cascade(css);
    const documents: BookDocument[] = [];
    for (const item of content) {
        const raw = await zip.file(opfDir + item.href)!.async('text');
        documents.push({ href: item.href, raw, doc: parseXml(raw.replace(SOFT_HYPHEN, '')) });
    }
    // ids referenciados por links (nav, ncx, índice remissivo…) — as âncoras desses ficam
    const referencedIds = new Set<string>();
    for (const f of Object.values(zip.files)) {
        if (!/\.(xhtml|html|ncx)$/i.test(f.name)) continue;
        for (const m of (await f.async('text')).matchAll(/(?:href|src)="[^"#]*#([^"]+)"/g)) referencedIds.add(m[1]);
    }
    return {
        zip, opfPath, opfDir, opf, items, documents, resolve, css,
        bodySize: bodySizeOf(documents, resolve), referencedIds, frontMatter: frontMatterOf(documents),
    };
}
export type Book = Awaited<ReturnType<typeof openBook>>;
