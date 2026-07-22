import JSZip from 'jszip';
import type { ExtractedDocument } from './document-importer';

export interface EpubMetadata {
    ebook_isbn: string;
    title: string;
    author: string;
    publisher?: string;
    language?: string;
    description?: string;
    subjects?: string;
    pub_date?: string;
}

// Importa um EPUB revertendo o pipeline de export da app (src/services/epub/).
// Foco: EPUBs gerados pela própria app (sectionN.xhtml com as classes do editor).
// Abre EPUBs de terceiros em best-effort (concatena o spine, mapeia o que reconhece).

const MIME_BY_EXT: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
};

const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const decodeEntities = (s: string) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/&amp;/g, '&');

// Metadados Dublin Core do OPF → campos do Ebook. Regex tolerante a prefixo de namespace.
function parseOpfMetadata(opfXml: string, fallbackIsbn: string): EpubMetadata {
    const grab = (tag: string) => {
        const m = opfXml.match(new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i'));
        return m ? decodeEntities(m[1].trim()) : '';
    };
    const grabAll = (tag: string) =>
        Array.from(opfXml.matchAll(new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'gi')))
            .map(m => decodeEntities(m[1].trim())).filter(Boolean);
    const isbn = (grab('identifier').match(/[\d-]{8,}/)?.[0] || fallbackIsbn).trim();
    const date = grab('date').slice(0, 10);
    return {
        ebook_isbn: isbn,
        title: grab('title'),
        author: grab('creator'),
        publisher: grab('publisher') || undefined,
        language: grab('language') || undefined,
        description: grab('description') || undefined,
        subjects: grabAll('subject').join('; ') || undefined,
        pub_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    };
}

// Resolve um href relativo (com ../) contra o diretório do documento, dentro do zip.
function resolvePath(baseDir: string, href: string): string {
    const parts = (baseDir + href).split('/');
    const out: string[] = [];
    for (const p of parts) {
        if (p === '..') out.pop();
        else if (p !== '.' && p !== '') out.push(p);
    }
    return out.join('/');
}

// nav.xhtml (preferido) ou toc.ncx → href-do-ficheiro (sem âncora) → título.
async function buildNavTitles(
    zip: JSZip, opfDir: string, opf: Document, manifest: Map<string, string>,
): Promise<Map<string, string>> {
    const titles = new Map<string, string>();
    const add = (href: string | null, title: string) => {
        if (!href || !title.trim()) return;
        const file = href.split('#')[0];
        if (!titles.has(file)) titles.set(file, title.trim());
    };

    // nav.xhtml: item do manifest com properties="nav"
    let navHref: string | null = null;
    for (const item of Array.from(opf.getElementsByTagName('item'))) {
        if ((item.getAttribute('properties') || '').split(/\s+/).includes('nav')) {
            navHref = item.getAttribute('href');
            break;
        }
    }
    if (navHref) {
        const navXml = await zip.file(resolvePath(opfDir, navHref))?.async('text');
        if (navXml) {
            const navDoc = new DOMParser().parseFromString(navXml, 'text/html');
            navDoc.querySelectorAll('nav a[href]').forEach(a =>
                add(a.getAttribute('href'), a.textContent || ''));
            if (titles.size > 0) return titles;
        }
    }

    // Fallback: toc.ncx (media-type application/x-dtbncx+xml)
    let ncxHref: string | null = null;
    for (const item of Array.from(opf.getElementsByTagName('item'))) {
        if (item.getAttribute('media-type') === 'application/x-dtbncx+xml') {
            ncxHref = item.getAttribute('href');
            break;
        }
    }
    if (ncxHref) {
        const ncxXml = await zip.file(resolvePath(opfDir, ncxHref))?.async('text');
        if (ncxXml) {
            const ncx = new DOMParser().parseFromString(ncxXml, 'application/xml');
            for (const np of Array.from(ncx.getElementsByTagName('navPoint'))) {
                const text = np.getElementsByTagName('text')[0]?.textContent || '';
                const src = np.getElementsByTagName('content')[0]?.getAttribute('src');
                add(src, text);
            }
        }
    }
    return titles;
    void manifest;
}

// <section epub:type> wrappers → desembrulhar (manter filhos).
function unwrapSections(body: HTMLElement) {
    for (const sec of Array.from(body.querySelectorAll('section'))) {
        while (sec.firstChild) sec.parentNode!.insertBefore(sec.firstChild, sec);
        sec.remove();
    }
}

// Reverter notas para o modelo do editor (o que `linkFootnotes` consome no re-export):
//   ref no corpo:  <sup id><a epub:type=noteref>N</a></sup>  →  <sup>N</sup>
//   definição:     <aside class="footnote"><p><sup><a doc-backlink>N</a></sup> txt</p></aside>
//                  →  <p class="footnote"><sup>N</sup> txt</p>
function reverseFootnotes(body: HTMLElement) {
    // Refs no corpo
    body.querySelectorAll('sup').forEach(sup => {
        const a = sup.querySelector('a');
        if (a && (a.getAttribute('epub:type') === 'noteref' || a.getAttribute('role') === 'doc-noteref')) {
            sup.removeAttribute('id');
            sup.textContent = a.textContent || '';
        }
    });
    // Separador das notas
    body.querySelectorAll('hr.footnote-sep').forEach(hr => hr.remove());
    // Wrapper opcional <div class="footnotes-section"> → desembrulhar
    body.querySelectorAll('div.footnotes-section').forEach(div => {
        while (div.firstChild) div.parentNode!.insertBefore(div.firstChild, div);
        div.remove();
    });
    // Definições: <aside class="footnote"> → <p class="footnote">
    body.querySelectorAll('aside.footnote').forEach(aside => {
        aside.querySelectorAll('a[role="doc-backlink"]').forEach(a => {
            while (a.firstChild) a.parentNode!.insertBefore(a.firstChild, a);
            a.remove();
        });
        const innerP = aside.querySelector(':scope > p');
        const p = document.createElement('p');
        p.className = 'footnote';
        p.innerHTML = innerP ? innerP.innerHTML : aside.innerHTML;
        aside.replaceWith(p);
    });
    // Definições já como <p class="footnote"> (outros caminhos): só limpar backlink
    body.querySelectorAll('p.footnote a[role="doc-backlink"]').forEach(a => {
        while (a.firstChild) a.parentNode!.insertBefore(a.firstChild, a);
        a.remove();
    });
}

// <span epub:type="pagebreak" id="page-N" aria-label="N"> → <span class="pagebreak" data-page="N">
function reversePagebreaks(body: HTMLElement) {
    body.querySelectorAll('span').forEach(span => {
        if (span.getAttribute('epub:type') !== 'pagebreak' && span.getAttribute('role') !== 'doc-pagebreak') return;
        const page = span.getAttribute('aria-label') || (span.getAttribute('id') || '').replace(/^page-/, '');
        const repl = document.createElement('span');
        repl.className = 'pagebreak';
        if (page) repl.setAttribute('data-page', page);
        span.replaceWith(repl);
    });
}

// <span class="underline">texto</span> → <u>texto</u>: o editor não tem classe/CSS para
// "underline" (nem estilo dedicado nem botão de toolbar) — como <u> nativo, o browser e os
// leitores EPUB tratam do sublinhado sozinhos, sem precisar de CSS nenhum.
function reverseUnderline(body: HTMLElement) {
    body.querySelectorAll('span.underline').forEach(span => {
        const u = document.createElement('u');
        u.innerHTML = span.innerHTML;
        span.replaceWith(u);
    });
}

const MAX_IMAGE_BYTES = 2_000_000; // = limite do servidor (server/routes/images.js); maior → saltar

// <img src="Images/{id}.ext"> → <img data-image-id="{id}" src="placeholder">; recolhe o blob.
// `skipIds` = imagens a NÃO colocar na galeria (capa — é separada). Imagens > 2MB são saltadas
// (o upload em lote do useEbookImport daria 413).
async function reverseImages(
    body: HTMLElement, zip: JSZip, docDir: string, images: Map<string, Blob>, skipIds: Set<string>,
) {
    for (const img of Array.from(body.querySelectorAll('img'))) {
        const src = img.getAttribute('src') || '';
        const m = src.match(/([^/]+)\.([A-Za-z0-9]+)$/);
        if (!m) continue;
        const [, id, ext] = m;
        if (skipIds.has(id)) { img.remove(); continue; } // capa → fora da galeria
        if (!images.has(id)) {
            const entry = zip.file(resolvePath(docDir, src));
            if (entry) {
                const buf = await entry.async('arraybuffer');
                if (buf.byteLength > MAX_IMAGE_BYTES) { img.remove(); continue; } // > limite → saltar
                images.set(id, new Blob([buf], { type: MIME_BY_EXT[ext.toLowerCase()] || 'image/png' }));
            }
        }
        img.setAttribute('data-image-id', id);
        img.setAttribute('src', 'placeholder');
    }
}

// === Adaptação de EPUBs de plataformas ANTIGAS (classes/estrutura diferentes) =================
// Discriminador: o export desta app usa OEBPS/sectionN.XHTML; os antigos usam SectionNN.html.

// Classes que a nova plataforma entende (passam intactas).
const NEW_CLASSES = new Set([
    'p-indent', 'p-non-indent', 'p-top', 'p-space', 'p-small', 'p-bold', 'p-italic', 'p-bold-italic',
    'p-center', 'p-quote', 'p-legendas', 'footnote', 'footnote-ref', 'drop-cap', 'alinea',
    'chapter-break', 'small-caps', 'pagebreak', 'p-border-top', 'p-border-bottom', 'p-border-sides',
    'img-left', 'img-center', 'img-right', 'underline',
]);
// Classe antiga → classe(s) nova(s). Vazio/ausente = dropar (ruído estrutural).
const LEGACY_CLASS_MAP: Record<string, string> = {
    'indent-nonspace': 'p-indent', 'nonindent-nonspace': 'p-non-indent', 'noindent': 'p-non-indent',
    'space-top': 'p-top', 'centered': 'p-center', 'title': 'p-center p-bold',
};

// Parseia o stylesheet do EPUB: classes com font-size < 1em (ex. p.p1{font-size:0.8em}) → "pequeno".
function parseSmallClasses(css: string): Set<string> {
    const small = new Set<string>();
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const fs = /font-size\s*:\s*([\d.]+)\s*em/.exec(m[2]);
        if (fs && parseFloat(fs[1]) < 1) {
            for (const c of m[1].matchAll(/\.([\w-]+)/g)) small.add(c[1]);
        }
    }
    return small;
}

// Destino automático de uma classe legacy: nova→a própria, mapeada→destino, pequena→p-small,
// resto→'__drop__'. Base do `suggested` do scan e do fallback do `adaptLegacyClasses`.
function autoTarget(token: string, small: Set<string>): string {
    if (NEW_CLASSES.has(token)) return token;
    if (LEGACY_CLASS_MAP[token]) return LEGACY_CLASS_MAP[token];
    if (small.has(token)) return 'p-small';
    return '__drop__';
}

// Reescreve as classes de todos os elementos. `mapping` (classe legacy → alvo escolhido pelo
// utilizador: nome(s) de classe, '__keep__' ou '__drop__') vence; sem entrada → auto (autoTarget).
// Footnote força classe exatamente "footnote" (o linkFootnotes do re-export exige-o).
function adaptLegacyClasses(body: HTMLElement, small: Set<string>, mapping?: Record<string, string>) {
    for (const el of Array.from(body.querySelectorAll('[class]'))) {
        const tokens = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
        if (tokens.includes('footnote')) { el.className = 'footnote'; continue; }
        const out = new Set<string>();
        for (const t of tokens) {
            const target = mapping && t in mapping ? mapping[t] : autoTarget(t, small);
            if (target === '__drop__') continue;
            if (target === '__keep__') { out.add(t); continue; }
            target.split(' ').filter(Boolean).forEach(x => out.add(x));
        }
        if (out.size) el.className = [...out].join(' ');
        else el.removeAttribute('class');
    }
}

// Remapeia cabeçalhos por tag conforme a escolha do utilizador (mapping['h1'|'h2'|'h3']):
// outro h1-h3 → troca de nível; classe de parágrafo → vira <p class>; __drop__ → remove; senão mantém.
function applyHeadingMapping(body: HTMLElement, mapping?: Record<string, string>) {
    if (!mapping) return;
    for (const h of Array.from(body.querySelectorAll('h1,h2,h3'))) {
        const target = mapping[h.tagName.toLowerCase()];
        if (!target || target === '__keep__') continue;
        if (target === '__drop__') { h.remove(); continue; }
        const el = body.ownerDocument.createElement(/^h[1-3]$/.test(target) ? target : 'p');
        if (!/^h[1-3]$/.test(target)) el.className = target;
        el.innerHTML = h.innerHTML;
        h.replaceWith(el);
    }
}

// Remove <p> vazios (separadores) e funde corridas de <h1> consecutivos (número + título)
// num só <h1 class="chapter-break">nº<br>título</h1> (padrão de capítulo da nova plataforma).
function mergeChapterHeadings(body: HTMLElement) {
    for (const p of Array.from(body.querySelectorAll('p'))) {
        if (!(p.textContent || '').trim() && !p.querySelector('img')) p.remove();
    }
    const h1s = Array.from(body.querySelectorAll('h1'));
    let i = 0;
    while (i < h1s.length) {
        const run = [h1s[i]];
        while (i + run.length < h1s.length && h1s[i + run.length].previousElementSibling === run[run.length - 1]) {
            run.push(h1s[i + run.length]);
        }
        if (run.length >= 2) {
            const merged = body.ownerDocument.createElement('h1');
            merged.className = 'chapter-break';
            merged.innerHTML = run.map(h => h.innerHTML.trim()).join('<br>');
            run[0].replaceWith(merged);
            run.slice(1).forEach(h => h.remove());
        }
        i += run.length;
    }
}

// Notas antigas (marcador * + ids note/footnote por par) → convenção nova (sequencial):
//   ref  <a id="noteX" href="#footnoteX"><sup>*</sup></a> → <sup><a href="#footnote-N" class="footnote-ref">N</a></sup>
//   def  <p class="footnote"><a id="footnoteX" …><sup>*</sup></a> txt → <p class="footnote" id="footnote-N"><sup>N</sup> txt</p>
function adaptLegacyFootnotes(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let n = 0;
    for (const def of Array.from(doc.querySelectorAll('p.footnote'))) {
        n++;
        const anchor = def.querySelector('a[id]');
        const fnId = anchor?.getAttribute('id'); // footnoteX
        if (fnId) {
            const ref = doc.querySelector(`a[href="#${fnId}"]`);
            if (ref) ref.outerHTML = `<sup><a href="#footnote-${n}" class="footnote-ref">${n}</a></sup>`;
        }
        if (anchor) anchor.remove();
        const text = def.innerHTML.trim();
        def.className = 'footnote';
        def.setAttribute('id', `footnote-${n}`);
        def.innerHTML = `<sup>${n}</sup> ${text}`;
    }
    return doc.body.innerHTML;
}

// Abre o EPUB e resolve OPF + manifest + spine (passos 1–2, partilhado por scan e extract).
async function openEpub(file: File) {
    const zip = await JSZip.loadAsync(file);

    // 1. container.xml → caminho do OPF
    const containerXml = await zip.file('META-INF/container.xml')?.async('text');
    if (!containerXml) throw new Error('EPUB inválido: falta META-INF/container.xml');
    const container = new DOMParser().parseFromString(containerXml, 'application/xml');
    const opfPath = container.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
    if (!opfPath) throw new Error('EPUB inválido: OPF não encontrado');
    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

    // 2. OPF → manifest (id→href) + spine (ordem)
    const opfXml = await zip.file(opfPath)!.async('text');
    const opf = new DOMParser().parseFromString(opfXml, 'application/xml');
    const manifest = new Map<string, string>();
    for (const item of Array.from(opf.getElementsByTagName('item'))) {
        const id = item.getAttribute('id'), href = item.getAttribute('href');
        if (id && href) manifest.set(id, href);
    }
    const spineHrefs: string[] = [];
    for (const ir of Array.from(opf.getElementsByTagName('itemref'))) {
        const href = manifest.get(ir.getAttribute('idref') || '');
        if (href) spineHrefs.push(href);
    }
    return { zip, opfDir, opfXml, opf, manifest, spineHrefs };
}

// EPUB de plataforma ANTIGA? (spine não usa *.xhtml). Só estes precisam de mapeamento de classes.
const isLegacyEpub = (spineHrefs: string[]) =>
    spineHrefs.length > 0 && !spineHrefs[0].toLowerCase().endsWith('.xhtml');

// Junta todos os stylesheets do zip e devolve o conjunto de classes "pequenas" (font-size<1em).
async function collectSmallClasses(zip: JSZip): Promise<Set<string>> {
    let css = '';
    for (const [name, entry] of Object.entries(zip.files)) {
        if (name.toLowerCase().endsWith('.css')) css += await entry.async('text') + '\n';
    }
    return parseSmallClasses(css);
}

export interface EpubClassInfo {
    name: string;      // classe legacy encontrada no corpo
    count: number;     // nº de elementos que a usam
    sample: string;    // 1º texto não-vazio (para o utilizador reconhecer)
    suggested: string; // alvo auto (autoTarget) — seed do dropdown
}

// Analisa um EPUB para o modal de mapeamento: lista as classes legacy usadas no corpo.
// EPUB não-antigo → { legacy:false } (importa direto, sem modal).
export async function scanEpubClasses(file: File): Promise<{ legacy: boolean; classes: EpubClassInfo[] }> {
    const { zip, opfDir, spineHrefs } = await openEpub(file);
    if (!isLegacyEpub(spineHrefs)) return { legacy: false, classes: [] };

    const small = await collectSmallClasses(zip);
    const info = new Map<string, EpubClassInfo>();
    for (const href of spineHrefs) {
        const xhtml = await zip.file(resolvePath(opfDir, href))?.async('text');
        if (!xhtml) continue;
        const doc = new DOMParser().parseFromString(xhtml, 'text/html');
        const bump = (name: string, suggested: string, text: string) => {
            let e = info.get(name);
            if (!e) { e = { name, count: 0, sample: '', suggested }; info.set(name, e); }
            e.count++;
            if (!e.sample && text) e.sample = text.slice(0, 80);
        };
        for (const el of Array.from(doc.body.querySelectorAll('[class]'))) {
            const tokens = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
            if (tokens.includes('footnote')) continue; // sempre forçado a footnote — fora do mapeamento
            const text = (el.textContent || '').trim();
            for (const t of tokens) bump(t, autoTarget(t, small), text);
        }
        // Cabeçalhos (tag, não classe) — remapáveis por tag; sugestão = manter o próprio nível.
        for (const h of Array.from(doc.body.querySelectorAll('h1,h2,h3'))) {
            const tag = h.tagName.toLowerCase();
            bump(tag, tag, (h.textContent || '').trim());
        }
    }
    return { legacy: true, classes: [...info.values()].sort((a, b) => b.count - a.count) };
}

export async function extractEpub(file: File, mapping?: Record<string, string>): Promise<ExtractedDocument> {
    const { zip, opfDir, opfXml, opf, manifest, spineHrefs } = await openEpub(file);

    const navTitles = await buildNavTitles(zip, opfDir, opf, manifest);

    // Capa (separada do livro) → não entra na galeria. <meta name="cover"> ou item cover-image.
    const skipIds = new Set<string>();
    const metaCover = Array.from(opf.getElementsByTagName('meta'))
        .find(mt => mt.getAttribute('name') === 'cover')?.getAttribute('content');
    let coverHref = metaCover ? manifest.get(metaCover) : undefined;
    if (!coverHref) coverHref = Array.from(opf.getElementsByTagName('item'))
        .find(it => (it.getAttribute('properties') || '').split(/\s+/).includes('cover-image'))
        ?.getAttribute('href') || undefined;
    if (coverHref) {
        const cm = coverHref.match(/([^/]+)\.[A-Za-z0-9]+$/);
        if (cm) skipIds.add(cm[1]);
    }

    // EPUB de plataforma ANTIGA? (não usa OEBPS/*.xhtml). Se sim, adaptar classes/estrutura/notas.
    const isLegacy = isLegacyEpub(spineHrefs);
    const small = isLegacy ? await collectSmallClasses(zip) : new Set<string>();

    // 3. Processar cada documento do spine por ordem
    const images = new Map<string, Blob>();
    const bodies: string[] = [];
    for (const href of spineHrefs) {
        const xhtml = await zip.file(resolvePath(opfDir, href))?.async('text');
        if (!xhtml) continue;
        const docDir = href.includes('/') ? opfDir + href.slice(0, href.lastIndexOf('/') + 1) : opfDir;
        const doc = new DOMParser().parseFromString(xhtml, 'text/html');
        const body = doc.body;

        unwrapSections(body);
        if (isLegacy) {
            adaptLegacyClasses(body, small, mapping);
            applyHeadingMapping(body, mapping);
            mergeChapterHeadings(body);
        } else {
            reverseFootnotes(body);
        }
        reversePagebreaks(body);
        reverseUnderline(body);
        await reverseImages(body, zip, docDir, images, skipIds);

        let content = body.innerHTML.trim();
        if (!content) continue;
        // Reconstruir título de quebra (export próprio remove o heading do corpo; título vive no nav)
        if (!isLegacy && !/^<h[12][\s>]/i.test(content)) {
            const title = navTitles.get(href.split('#')[0]);
            if (title) content = `<h2 class="chapter-break">${escapeHtml(title)}</h2>\n` + content;
        }
        bodies.push(content);
    }

    let html = bodies.join('\n');
    if (isLegacy) html = adaptLegacyFootnotes(html); // renumera notas (* + ids → sequencial)

    const fallbackIsbn = file.name.replace(/\.epub$/i, '');
    const metadata = parseOpfMetadata(opfXml, fallbackIsbn);
    return { html, images, metadata };
}
